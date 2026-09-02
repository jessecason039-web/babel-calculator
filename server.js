const express = require('express');
const axios = require('axios');
const path = require('path');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const BABEL_USER = "Mohamed_Mostafa";
const BABEL_PASS = "Babel949945";
const BABEL_API_URL = "https://www.babel-express.com/api/v1/webservice.php";

const authHeader = 'Basic ' + Buffer.from(`${BABEL_USER}:${BABEL_PASS}`).toString('base64');
const headers = { 'Content-Type': 'application/json', 'Authorization': authHeader };

// ذاكرة تخزين مؤقت لشجرة مناطق سوريا بالكامل
let cachedGeographicTree = null;
let isTreeLoading = false;

// دالة لجلب وفهرسة جميع مناطق وأحياء سوريا من بابل إكسبريس
async function buildFullTree() {
    if (cachedGeographicTree) return cachedGeographicTree;
    if (isTreeLoading) return null;
    isTreeLoading = true;

    try {
        console.log("جاري تحميل وفهرسة شجرة مناطق سوريا بالكامل من بابل إكسبريس...");
        const citiesRes = await axios.post(`${BABEL_API_URL}/getCities`, {}, { headers });
        const cities = citiesRes.data.cities || [];
        
        let allNeighbourhoods = [];

        for (const city of cities) {
            try {
                const areasRes = await axios.post(`${BABEL_API_URL}/getAreas`, { cityID: city.id }, { headers });
                const areas = areasRes.data.areas || [];

                for (const area of areas) {
                    try {
                        const nRes = await axios.post(`${BABEL_API_URL}/getNeighbourhoods`, { areaID: area.id }, { headers });
                        const neighbourhoods = nRes.data.neighbourhoods || [];

                        for (const n of neighbourhoods) {
                            allNeighbourhoods.push({
                                id: n.id,
                                name: n.name,
                                areaId: area.id,
                                areaName: area.name,
                                cityId: city.id,
                                cityName: city.name
                            });
                        }
                    } catch (e) {}
                }
            } catch (e) {}
        }

        cachedGeographicTree = { cities, neighbourhoods: allNeighbourhoods };
        console.log(`تمت الفهرسة بنجاح: تم تخزين ${allNeighbourhoods.length} حي وبلدة.`);
        isTreeLoading = false;
        return cachedGeographicTree;
    } catch (err) {
        console.error("فشل فهرسة الشجرة", err.message);
        isTreeLoading = false;
        return null;
    }
}

// مسار لجلب شجرة المناطق بالكامل للبحث اللحظي الخاطف
app.get('/api/locations-tree', async (req, res) => {
    const tree = await buildFullTree();
    if (tree) {
        res.json({ status: "success", data: tree });
    } else {
        res.status(500).json({ status: "error", errorMessage: "جاري تجهيز قاعدة البيانات..." });
    }
});

// المسار العام لتمرير طلبات الـ API
app.post('/api/:action', async (req, res) => {
    const action = req.params.action;
    try {
        const response = await axios.post(`${BABEL_API_URL}/${action}`, req.body, { headers });
        res.status(response.status).json(response.data);
    } catch (error) {
        if (error.response) {
            res.status(error.response.status).json(error.response.data);
        } else {
            res.status(500).json({ status: "error", errorMessage: "فشل الاتصال بخادم بابل إكسبريس" });
        }
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
    // بدء بناء الفهرس فور تشغيل السيرفر
    buildFullTree();
});
