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

        // -------------------------
        // GET ALL USERS
        // -------------------------
        app.get("/users", async (req, res) => {
          try {
            const users = await usersCollection.find().toArray();
            res.send(users);
          } catch (error) {
            console.error("Error fetching users:", error);
            res.status(500).send({ error: "Failed to fetch users" });
          }
        });

        // -------------------------
        // UPDATE USER ROLE
        // -------------------------
        app.patch("/users/:id/role", async (req, res) => {
          const { id } = req.params;
          const { role } = req.body;

          if (!role || !["user", "librarian", "admin"].includes(role)) {
            return res.status(400).send({ error: "Invalid role" });
          }

          try {
            const result = await usersCollection.updateOne(
              { _id: new ObjectId(id) },
              { $set: { role } }
            );

            if (result.modifiedCount > 0) {
              res.send({ success: true, message: `Role updated to ${role}` });
            } else {
              res.status(404).send({ error: "User not found or role unchanged" });
            }
          } catch (error) {
            console.error("Error updating role:", error);
            res.status(500).send({ error: "Failed to update role" });
          }
        });

        // -------------------------
        // SAVE USER
        // -------------------------
        app.post('/users', async (req, res) => {
            const newUser = req.body;
            const email = req.body.email;

            const existingUser = await usersCollection.findOne({ email });
            if (existingUser) {
                return res.send({ message: 'User already exists' });
            }

            const result = await usersCollection.insertOne(newUser);
            res.send(result);
        });

        // -------------------------
        // ADD NEW BOOK
        // -------------------------
        app.post("/books", async (req, res) => {
            try {
                const book = req.body;

                if (!book.bookName || !book.author || !book.price) {
                    return res.status(400).send({ error: "Missing required fields: bookName, author, price" });
                }

                const result = await booksCollection.insertOne(book);
                res.send({ success: true, message: "Book added successfully", insertedId: result.insertedId });
            } catch (error) {
                console.error("Error inserting book:", error);
                res.status(500).send({ error: "Failed to add book" });
            }
        });

        // -------------------------
        // GET ALL BOOKS (only published)
        // -------------------------
        app.get('/books', async (req, res) => {
            try {
                const result = await booksCollection.find({ status: "publish" }).toArray();
                res.send(result);
            } catch (error) {
                console.error("Failed to fetch books:", error);
                res.status(500).send({ error: "Failed to fetch books" });
            }
        });


        // CHECK MONGODB CONNECTION
        await client.db("admin").command({ ping: 1 });
        console.log("MongoDB connected!");

    } finally {}
}

run().catch(console.dir);

app.listen(port, () => {
    console.log(`Server running on port ${port}`);
});
