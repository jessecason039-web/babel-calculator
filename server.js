const express = require('express');
const axios = require('axios');
const path = require('path');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// بيانات حساب بابل إكسبريس
const BABEL_USER = "Mohamed_Mostafa";
const BABEL_PASS = "Babel949945";
const BABEL_API_URL = "https://www.babel-express.com/api/v1/webservice.php";

// مسار استقبال الطلبات والاتصال بشركة الشحن
app.post('/api/:action', async (req, res) => {
    const action = req.params.action;
    const authHeader = 'Basic ' + Buffer.from(`${BABEL_USER}:${BABEL_PASS}`).toString('base64');

    try {
        const response = await axios.post(`${BABEL_API_URL}/${action}`, req.body, {
            headers: {
                'Content-Type': 'application/json',
                'Authorization': authHeader
            }
        });
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
});
