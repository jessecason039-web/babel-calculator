const express = require('express');
const axios = require('axios');
const path = require('path');
const mongoose = require('mongoose');

const app = express();
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// ⚙️ رابط قاعدة بيانات MongoDB Atlas
const MONGO_URI = "mongodb+srv://jessecason039_db_user:0nWUr26w5Y8NHpBH@cluster0.l7h705q.mongodb.net/babel_orders?retryWrites=true&w=majority&appName=Cluster0";

let dbError = null;
mongoose.connect(MONGO_URI)
  .then(() => {
      dbError = null;
      console.log("✅ تم الاتصال بقاعدة بيانات MongoDB بنجاح!");
  })
  .catch(err => {
      dbError = err.message;
      console.error("❌ خطأ في الاتصال بقاعدة البيانات:", err.message);
  });

// ==========================================
// 📦 مخطط قاعدة البيانات للطلبات (Order Schema)
// ==========================================
const orderSchema = new mongoose.Schema({
    marketerCode: { type: String, default: "" },
    niche: { type: String, default: "" },
    itemsText: { type: String, default: "" },
    customerName: { type: String, required: true },
    customerPhone: { type: String, required: true },
    customerAddress: { type: String, default: "" },
    cityName: { type: String, default: "" },
    areaName: { type: String, default: "" },
    neighbourhoodName: { type: String, default: "" },
    neighbourhoodId: { type: Number, default: null },
    statedDeliveryFee: { type: Number, default: 0 },
    actualDeliveryFee: { type: Number, default: 0 },
    totalWithDelivery: { type: Number, default: 0 },
    commission: { type: Number, default: 0 },
    netMerchantAmount: { type: Number, default: 0 },
    codAmount: { type: Number, default: 0 },
    customerNotes: { type: String, default: "" },
    originBranch: { type: String, default: "طرطوس - المحطة" },
    barcodeRaw: { type: String, default: "" },
    barcodeSerial: { type: String, default: "" },
    barcodeCode: { type: String, default: "" },
    awb: { type: String, default: "" },
    orderStatus: { type: String, default: "pending" },
    shipmentStatusText: { type: String, default: "قيد المراجعة" },
    commissionStatus: { type: String, default: "unpaid" },
    paidAt: { type: Date, default: null },
    isPrinted: { type: Boolean, default: false },
    printedAt: { type: Date, default: null },
    createdAt: { type: Date, default: Date.now }
});

const Order = mongoose.model('Order', orderSchema);

// بيانات بابل إكسبريس
const BABEL_USER = "Mohamed_Mostafa";
const BABEL_PASS = "Babel949945";
const BABEL_API_URL = "https://www.babel-express.com/api/v1/webservice.php";

const authHeader = 'Basic ' + Buffer.from(`${BABEL_USER}:${BABEL_PASS}`).toString('base64');
const headers = { 'Content-Type': 'application/json', 'Authorization': authHeader };

// مسار فحص الاتصال بقاعدة البيانات
app.get('/api/db-status', (req, res) => {
    const isConnected = mongoose.connection.readyState === 1;
    res.json({
        database: isConnected ? "متصلة بنجاح ✅" : "غير متصلة ❌",
        status: isConnected ? "connected" : "disconnected",
        details: isConnected ? "All good" : dbError
    });
});

// ==========================================
// 🛠️ مسارات إدارة الطلبات
// ==========================================

// 1. جلب الطلبات
app.get('/api/orders', async (req, res) => {
    try {
        const { status, marketerCode } = req.query;
        let query = {};
        if (status) query.orderStatus = status;
        if (marketerCode) query.marketerCode = marketerCode;

        const orders = await Order.find(query).sort({ createdAt: -1 });
        res.json({ status: "success", orders });
    } catch (e) {
        res.status(500).json({ status: "error", message: e.message });
    }
});

// 2. حفظ / تحديث طلب في قاعدة البيانات
app.post('/api/orders/save', async (req, res) => {
    try {
        const orderData = req.body;
        let order;
        if (orderData._id) {
            order = await Order.findByIdAndUpdate(orderData._id, orderData, { new: true });
        } else {
            order = new Order(orderData);
            await order.save();
        }
        res.json({ status: "success", order });
    } catch (e) {
        res.status(500).json({ status: "error", message: e.message });
    }
});

// 3. الحذف الآمن (يشترط موافقة بابل أولاً ويمنع حذف الشحنات التي في المركز)
app.post('/api/orders/delete', async (req, res) => {
    try {
        const { id, awb } = req.body;

        if (awb && awb.trim().length > 0) {
            try {
                // محاولة الإلغاء في بابل إكسبريس أولاً
                await axios.post(`${BABEL_API_URL}/deleteShipment`, { awb: awb.trim() }, { headers, timeout: 10000 });
                console.log(`تم إلغاء الشحنة في بابل إكسبريس: ${awb}`);
            } catch (babelErr) {
                // إذا رفضت بابل الحذف لأنها في المركز أو قيد النقل، نوقف الحذف فوراً لحماية السجل
                const errDetail = babelErr.response?.data?.errorMessage || babelErr.message;
                return res.status(400).json({
                    status: "error",
                    message: `❌ رفضت بابل إكسبريس حذف الشحنة (${awb}) لأنها أصبحت بعهدة الشركة (في المركز أو قيد النقل). تم إيقاف الحذف لحماية سجلاتك.`
                });
            }
        }

        if (id) {
            await Order.findByIdAndDelete(id);
        } else if (awb) {
            await Order.findOneAndDelete({ awb: awb.trim() });
        }

        res.json({ status: "success", message: "تم حذف وإلغاء الشحنة بنجاح" });
    } catch (e) {
        res.status(500).json({ status: "error", message: e.message });
    }
});

// 4. استرجاع شحنة محذوفة بالبوليصة AWB من بابل إكسبريس
app.post('/api/orders/recover', async (req, res) => {
    try {
        const { awb } = req.body;
        if (!awb || !awb.trim()) {
            return res.status(400).json({ status: "error", message: "رقم البوليصة مطلوب" });
        }
        const cleanAwb = awb.trim();

        // فحص هل الشحنة مسجلة مسبقاً
        const existing = await Order.findOne({ awb: cleanAwb });
        if (existing) {
            return res.status(400).json({ status: "error", message: "هذه الشحنة موجودة بالفعل في السجل ولم تُحذف!" });
        }

        // جلب تفاصيل الشحنة الحية من بابل إكسبريس
        const trackRes = await axios.post(`${BABEL_API_URL}/trackShipment`, { awb: cleanAwb }, { headers, timeout: 10000 });
        if (trackRes.data && trackRes.data.status === 'success' && trackRes.data.tracking) {
            const trk = trackRes.data.tracking;
            const statusText = trk.shipmentStatus ? trk.shipmentStatus.text : "ضمن النقل";
            const statusCode = trk.shipmentStatus ? trk.shipmentStatus.code : "";

            let newOrderStatus = "sent";
            if (trk.isDelivered || statusCode === 'Delivered') {
                newOrderStatus = "delivered";
            } else if (statusCode === 'ReturnedToSender' || statusCode === 'DeliveryFailed') {
                newOrderStatus = "returned";
            }

            const recoveredOrder = new Order({
                marketerCode: "مسترجعة",
                niche: "بديل ذهب",
                customerName: trk.to ? trk.to.name : "زبونة بابل",
                customerPhone: "0900000000",
                customerAddress: trk.to ? `${trk.to.city || ''} - ${trk.to.area || ''} - ${trk.to.neighbourhood || ''}` : "عنوان بابل",
                cityName: trk.to ? trk.to.city : "",
                areaName: trk.to ? trk.to.area : "",
                neighbourhoodName: trk.to ? trk.to.neighbourhood : "",
                awb: cleanAwb,
                orderStatus: newOrderStatus,
                shipmentStatusText: statusText,
                isPrinted: true,
                printedAt: new Date()
            });

            await recoveredOrder.save();
            res.json({ status: "success", order: recoveredOrder, message: `✅ تم استرجاع الشحنة (${cleanAwb}) وتثبيتها بقاعدتك بنجاح!` });
        } else {
            res.status(404).json({ status: "error", message: "لم يتم العثور على شحنة بهذا الرقم في بابل إكسبريس" });
        }
    } catch (e) {
        const msg = e.response?.data?.errorMessage || e.message;
        res.status(500).json({ status: "error", message: `تعذر استرجاع الشحنة: ${msg}` });
    }
});

// 5. تتبع وتحديث حالة الشحنة
app.post('/api/orders/track', async (req, res) => {
    try {
        const { id, awb } = req.body;
        if (!awb) return res.status(400).json({ status: "error", message: "رقم البوليصة مطلوب" });

        const trackRes = await axios.post(`${BABEL_API_URL}/trackShipment`, { awb }, { headers, timeout: 10000 });
        if (trackRes.data && trackRes.data.status === 'success' && trackRes.data.tracking) {
            const trk = trackRes.data.tracking;
            const statusText = trk.shipmentStatus ? trk.shipmentStatus.text : "قيد المتابعة";
            const statusCode = trk.shipmentStatus ? trk.shipmentStatus.code : "";

            let newOrderStatus = "sent";
            if (trk.isDelivered || statusCode === 'Delivered') {
                newOrderStatus = "delivered";
            } else if (statusCode === 'ReturnedToSender' || statusCode === 'DeliveryFailed' || statusCode === 'Disposed') {
                newOrderStatus = "returned";
            }

            const updatedOrder = await Order.findOneAndUpdate(
                { awb: awb },
                {
                    shipmentStatusText: statusText,
                    orderStatus: newOrderStatus
                },
                { new: true }
            );

            return res.json({ status: "success", tracking: trk, order: updatedOrder });
        } else {
            return res.status(400).json({ status: "error", message: "تعذر جلب التتبع" });
        }
    } catch (e) {
        res.status(500).json({ status: "error", message: e.message });
    }
});

// 6. حسابات مسوقة محددة
app.get('/api/marketers/:code/stats', async (req, res) => {
    try {
        const code = req.params.code;
        const allOrders = await Order.find({ marketerCode: code });

        const deliveredOrders = allOrders.filter(o => o.orderStatus === 'delivered' || o.shipmentStatusText.includes('تم التسليم'));
        const returnedOrders = allOrders.filter(o => o.orderStatus === 'returned' || o.shipmentStatusText.includes('مرتجع'));
        const inTransitOrders = allOrders.filter(o => o.orderStatus === 'sent' && !o.shipmentStatusText.includes('تم التسليم') && !o.shipmentStatusText.includes('مرتجع'));
        const paidOrders = allOrders.filter(o => o.commissionStatus === 'paid');

        const unpaidCommissionSum = deliveredOrders
            .filter(o => o.commissionStatus !== 'paid')
            .reduce((sum, o) => sum + (o.commission || 0), 0);

        res.json({
            status: "success",
            stats: {
                totalCount: allOrders.length,
                deliveredCount: deliveredOrders.length,
                returnedCount: returnedOrders.length,
                inTransitCount: inTransitOrders.length,
                paidCount: paidOrders.length,
                unpaidCommissionSum
            },
            orders: {
                delivered: deliveredOrders.filter(o => o.commissionStatus !== 'paid'),
                returned: returnedOrders,
                inTransit: inTransitOrders,
                paid: paidOrders
            }
        });
    } catch (e) {
        res.status(500).json({ status: "error", message: e.message });
    }
});

// 7. تصفير عمولات مسوقة
app.post('/api/marketers/:code/settle', async (req, res) => {
    try {
        const code = req.params.code;
        const now = new Date();

        const result = await Order.updateMany(
            {
                marketerCode: code,
                $or: [{ orderStatus: 'delivered' }, { shipmentStatusText: { $regex: 'تم التسليم' } }],
                commissionStatus: { $ne: 'paid' }
            },
            {
                $set: {
                    commissionStatus: 'paid',
                    paidAt: now
                }
            }
        );

        res.json({ status: "success", modifiedCount: result.modifiedCount, settledAt: now });
    } catch (e) {
        res.status(500).json({ status: "error", message: e.message });
    }
});

// ==========================================
// 🌍 الشجرة الجغرافية والمسار العام للـ API
// ==========================================
let cachedGeographicTree = null;
let isTreeBuilding = false;

async function runInParallelBatches(items, asyncFn, batchSize = 12) {
    let results = [];
    for (let i = 0; i < items.length; i += batchSize) {
        const batch = items.slice(i, i + batchSize);
        const batchResults = await Promise.allSettled(batch.map(asyncFn));
        for (const res of batchResults) {
            if (res.status === 'fulfilled' && res.value) {
                results.push(res.value);
            }
        }
    }
    return results;
}

async function buildFullTree() {
    if (cachedGeographicTree) return cachedGeographicTree;
    if (isTreeBuilding) return null;
    isTreeBuilding = true;

    try {
        console.log("🚀 بدء المزامنة السريعة لمناطق سوريا من بابل إكسبريس...");
        const citiesRes = await axios.post(`${BABEL_API_URL}/getCities`, {}, { headers, timeout: 10000 });
        const cities = citiesRes.data.cities || [];
        
        const allAreasFlat = [];
        await Promise.allSettled(cities.map(async (city) => {
            try {
                const aRes = await axios.post(`${BABEL_API_URL}/getAreas`, { cityID: city.id }, { headers, timeout: 10000 });
                if (aRes.data && aRes.data.areas) {
                    aRes.data.areas.forEach(area => {
                        allAreasFlat.push({
                            cityId: city.id,
                            cityName: city.name,
                            areaId: area.id,
                            areaName: area.name
                        });
                    });
                }
            } catch (e) {}
        }));

        let allNeighbourhoods = [];
        await runInParallelBatches(allAreasFlat, async (areaObj) => {
            try {
                const nRes = await axios.post(`${BABEL_API_URL}/getNeighbourhoods`, { areaID: areaObj.areaId }, { headers, timeout: 10000 });
                if (nRes.data && nRes.data.neighbourhoods) {
                    nRes.data.neighbourhoods.forEach(n => {
                        allNeighbourhoods.push({
                            id: n.id,
                            name: n.name,
                            areaId: areaObj.areaId,
                            areaName: areaObj.areaName,
                            cityId: areaObj.cityId,
                            cityName: areaObj.cityName
                        });
                    });
                }
            } catch (e) {}
        }, 15);

        cachedGeographicTree = { cities, neighbourhoods: allNeighbourhoods };
        console.log(`✅ اكتملت المزامنة بنجاح: تم تخزين ${allNeighbourhoods.length} حي وبلدة.`);
        isTreeBuilding = false;
        return cachedGeographicTree;
    } catch (err) {
        console.error("❌ خطأ أثناء المزامنة:", err.message);
        isTreeBuilding = false;
        return null;
    }
}

app.get('/api/locations-tree', async (req, res) => {
    if (cachedGeographicTree) {
        return res.json({ status: "success", data: cachedGeographicTree });
    }
    const tree = await buildFullTree();
    if (tree) {
        res.json({ status: "success", data: tree });
    } else {
        res.status(503).json({ status: "loading", message: "جاري تجهيز البيانات..." });
    }
});

app.post('/api/:action', async (req, res) => {
    const action = req.params.action;
    try {
        const response = await axios.post(`${BABEL_API_URL}/${action}`, req.body, { headers, timeout: 12000 });
        res.status(response.status).json(response.data);
    } catch (error) {
        if (error.response) {
            res.status(error.response.status).json(error.response.data);
        } else {
            res.status(500).json({ status: "error", errorMessage: "فشل الاتصال بخادم شركة الشحن" });
        }
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server started on port ${PORT}`);
    buildFullTree();
});
