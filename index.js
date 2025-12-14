require("dotenv").config(); // 🔥 MUST BE FIRST

const express = require("express");
const cors = require("cors");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");

const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);

const app = express();
const port = process.env.PORT || 3000;



// middleware
app.use(cors());
app.use(express.json());

// mongodb uri
const uri = `mongodb+srv://${process.env.SECRET_KEY}:${process.env.SECRET_HASH}@cluster0.5grmxkk.mongodb.net/?appName=Cluster0`;

const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    }
});

app.get('/', (req, res) => {
    res.send('BookCourier server is running');
})

async function run() {
    try {
        await client.connect();

        const db = client.db('BookCourier');
        const booksCollection = db.collection('books');
        const usersCollection = db.collection('users');
        const ordersCollection = db.collection('orders');
        const paymentsCollection = db.collection("payments");
        const wishlistCollection = db.collection("wishlist");
        const reviewsCollection = db.collection("reviews");

        


        // CHECK MONGODB CONNECTION
        await client.db("admin").command({ ping: 1 });
        console.log("MongoDB connected!");

    } finally {}
}

run().catch(console.dir);

app.listen(port, () => {
    console.log(`Server running on port ${port}`);
});
