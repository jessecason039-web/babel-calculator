const express = require('express');
const axios = require('axios');
const path = require('path');
const mongoose = require('mongoose');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ⚙️ رابط قاعدة بيانات MongoDB بعد تصحيح كلمة المرور الدقيقة (U كبيرة)
const MONGO_URI = "mongodb+srv://jessecason039_db_user:0nWUr26w5Y8NHpBH@cluster0.l7h705q.mongodb.net/babel_orders?retryWrites=true&w=majority&appName=Cluster0";

let dbError = null;

// 🔌 الاتصال بقاعدة البيانات
mongoose.connect(MONGO_URI)
  .then(() => {
      dbError = null;
      console.log("✅ تم الاتصال بقاعدة بيانات MongoDB بنجاح!");
  })
  .catch(err => {
      dbError = err.message;
      console.error("❌ خطأ في الاتصال بقاعدة البيانات:", err.message);
  });

// بيانات بابل إكسبريس
const BABEL_USER = "Mohamed_Mostafa";
const BABEL_PASS = "Babel949945";
const BABEL_API_URL = "https://www.babel-express.com/api/v1/webservice.php";

const authHeader = 'Basic ' + Buffer.from(`${BABEL_USER}:${BABEL_PASS}`).toString('base64');
const headers = { 'Content-Type': 'application/json', 'Authorization': authHeader };

// مسار فحص حالة الاتصال بقاعدة البيانات
app.get('/api/db-status', (req, res) => {
    const isConnected = mongoose.connection.readyState === 1;
    res.json({
        database: isConnected ? "متصلة بنجاح ✅" : "غير متصلة ❌",
        status: isConnected ? "connected" : "disconnected",
        details: isConnected ? "All good" : dbError
    });
});

// الذاكرة المؤقتة للشجرة الجغرافية
let cachedGeographicTree = null;
let isTreeBuilding = false;

// دالة تنفيذ الطلبات المتوازية السريعة في دفعات
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

// بناء الشجرة بسرعة فائقة
async function buildFullTree() {
    if (cachedGeographicTree) return cachedGeographicTree;
    if (isTreeBuilding) return null;
    isTreeBuilding = true;

    try {
        console.log("🚀 بدء المزامنة السريعة لمناطق سوريا من بابل إكسبريس...");
        
        // 1. جلب المدن
        const citiesRes = await axios.post(`${BABEL_API_URL}/getCities`, {}, { headers, timeout: 10000 });
        const cities = citiesRes.data.cities || [];
        
        // 2. جلب مناطق كل المدن بالتوازي
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

        // 3. جلب أحياء كل المناطق في دفعات متوازية
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

// مسار استدعاء الشجرة الجغرافية
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

// المسار العام للـ API
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
