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

        // GET all books (for admin/manage page)
        app.get('/admin/books', async (req, res) => {
            try {
                const books = await booksCollection.find().toArray();
                res.send(books);
            } catch (error) {
                console.error(error);
                res.status(500).send({ error: "Failed to fetch books" });
            }
        });

        // GET books added by a specific librarian
        app.get('/librarian/books', async (req, res) => {
          const { email } = req.query;

          if (!email) {
            return res.status(400).send({ error: "Email is required" });
          }

          try {
            const books = await booksCollection
              .find({ librarianEmail: email })
              .toArray();

            res.send(books);
          } catch (error) {
            console.error("Failed to fetch librarian books:", error);
            res.status(500).send({ error: "Failed to fetch books" });
          }
        });
        // -------------------------
        // GET LATEST 6 BOOKS
        // -------------------------
        app.get('/latest-books', async (req, res) => {
          try {
            const latestBooks = await booksCollection
              .find({ status: "publish" })   // only published
              .sort({ addedAt: 1 })          // newest first
              .limit(6)                       // latest 6 books
              .toArray();

            res.send(latestBooks);
          } catch (err) {
            console.error("Failed to fetch latest books:", err);
            res.status(500).send({ error: "Failed to fetch latest books" });
          }
        });

        // -----------------------------------------
        // Wishlist - Get books by array of IDs
        // -----------------------------------------
        // ADD OR REMOVE WISHLIST
        app.post("/wishlist", async (req, res) => {
          const { bookId, userId } = req.body;

          if (!bookId || !userId) return res.status(400).send({ error: "bookId and userId required" });

          try {
            // Check if already in wishlist
            const exists = await wishlistCollection.findOne({ bookId, userId });

            if (exists) {
              // Remove from wishlist
              await wishlistCollection.deleteOne({ _id: exists._id });
              return res.send({ message: "Book removed from wishlist", action: "removed" });
            }

            // Add to wishlist
            const book = await booksCollection.findOne({ _id: new ObjectId(bookId) });
            if (!book) return res.status(404).send({ error: "Book not found" });

            await wishlistCollection.insertOne({
              bookId,
              userId,
              bookDetails: book,
              createdAt: new Date(),
            });

            res.send({ message: "Book added to wishlist", action: "added" });
          } catch (err) {
            console.error(err);
            res.status(500).send({ error: "Failed to update wishlist" });
          }
        });

        // GET WISHLIST BOOKS FOR A USER
        app.get("/wishlist", async (req, res) => {
          const { userId } = req.query;
          if (!userId) return res.status(400).send({ error: "userId required" });

          try {
            const wishlist = await wishlistCollection.find({ userId }).toArray();
            res.send(wishlist);
          } catch (err) {
            console.error(err);
            res.status(500).send({ error: "Failed to fetch wishlist" });
          }
        });

        // -------------------------
        // UPDATE A BOOK
        // -------------------------
        app.put("/books/:id", async (req, res) => {
          const { id } = req.params;
          const updatedData = req.body;

          try {
            // Only allow updating certain fields
            const updateFields = {
              bookName: updatedData.bookName,
              author: updatedData.author,
              status: updatedData.status,
              price: updatedData.price,
              image: updatedData.image,
              category: updatedData.category,
              publisher: updatedData.publisher,
              yearOfPublishing: updatedData.yearOfPublishing,
              totalPages: updatedData.totalPages,
              review: updatedData.review,
              rating: updatedData.rating,
              updatedAt: new Date(),
            };

            const result = await booksCollection.updateOne(
              { _id: new ObjectId(id) },
              { $set: updateFields }
            );

            if (result.modifiedCount > 0) {
              res.send({ success: true, message: "Book updated successfully" });
            } else {
              res.status(404).send({ error: "Book not found or no changes made" });
            }
          } catch (error) {
            console.error("Error updating book:", error);
            res.status(500).send({ error: "Failed to update book" });
          }
        });

        // PUBLISH / UNPUBLISH BOOK
        app.patch("/books/:id/status", async (req, res) => {
          const bookId = req.params.id;
          const { status } = req.body; // status: "publish" or "unpublish"

          if (!status) return res.status(400).send({ error: "Status required" });

          try {
            const result = await booksCollection.updateOne(
              { _id: new ObjectId(bookId) },
              { $set: { status } }
            );

            res.send({ success: true, message: `Book ${status}ed successfully` });
          } catch (err) {
            console.error(err);
            res.status(500).send({ error: "Failed to update status" });
          }
        });

        // DELETE BOOK AND RELATED ORDERS
        app.delete("/books/:id", async (req, res) => {
          const bookId = req.params.id;

          try {
            // Delete the book
            await booksCollection.deleteOne({ _id: new ObjectId(bookId) });

            // Delete all orders related to this book
            await ordersCollection.deleteMany({ bookId: new ObjectId(bookId) });

            res.send({ success: true, message: "Book and related orders deleted" });
          } catch (err) {
            console.error(err);
            res.status(500).send({ error: "Failed to delete book" });
          }
        });

        // -------------------------
        // GET SINGLE BOOK BY ID
        // -------------------------
        app.get('/book/:id', async (req, res) => {
            const id = req.params.id;
            const result = await booksCollection.findOne({ _id: new ObjectId(id) });
            res.send(result);
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
