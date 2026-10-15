import express from "express";

const app = express();

app.use(express.json());
app.use(express.urlencoded({
    extended: true
}));

app.get("/", (req, res) => {
    return res.status(200).json({
        message: "Hurray, Hostel Maintenance API is up and running!"
    })
});

export default app;