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

        // -------------------------
        // PLACE ORDER
        // -------------------------
        app.post('/orders', async (req, res) => {
          const { bookId, userId, librarianDetails, customerDetails } = req.body;

          if (!bookId || !userId || !librarianDetails || !customerDetails) {
            return res.status(400).send({ error: "Missing required fields" });
          }

          try {
            const orderData = {
          bookId: ObjectId.isValid(bookId) ? new ObjectId(bookId) : bookId,
          userId: ObjectId.isValid(userId) ? new ObjectId(userId) : userId,
          librarianDetails: {
            email: librarianDetails.email || "unknown",
            name: librarianDetails.name || "unknown",
            photo: librarianDetails.photo || "https://via.placeholder.com/50",
          },
          customerDetails: {
            email: customerDetails.email || "unknown",
            name: customerDetails.name || "unknown",
            photo: customerDetails.photo || "https://via.placeholder.com/50",
          },
          orderDate: new Date(),
          Orderstatus: "pending",
          paymentStatus: "unpaid",
          createdAt: new Date(),
        };


            const result = await ordersCollection.insertOne(orderData);

            res.send({ message: "Order placed successfully", insertedId: result.insertedId });
          } catch (err) {
            console.error(err);
            res.status(500).send({ error: "Failed to place order" });
          }
        });

        // Get orders for a specific user with book details, excluding cancelled
        app.get('/orders', async (req, res) => {
          const { email } = req.query; // customer email
          if (!email) return res.status(400).send({ error: "Email query required" });

          try {
            const orders = await ordersCollection.aggregate([
              { 
                $match: { 
                  "customerDetails.email": email,
                  "Orderstatus": { $ne: "cancelled" } // <-- exclude cancelled orders
                } 
              },
              {
                $lookup: {
                  from: "books",
                  localField: "bookId",
                  foreignField: "_id",
                  as: "bookDetails",
                },
              },
              { $unwind: "$bookDetails" }, // flatten array
            ]).toArray();

            res.send(orders);
          } catch (err) {
            console.error(err);
            res.status(500).send({ error: "Failed to fetch orders" });
          }
        });

        // Get orders for a specific librarian with book details
        app.get("/librarian/orders", async (req, res) => {
          try {
            const { email } = req.query;
            if (!email) return res.status(400).send({ error: "Email query required" });

            const orders = await ordersCollection.aggregate([
              {
                $match: { "librarianDetails.email": email }
              },
              {
                // Convert bookId to ObjectId if it's a string
                $addFields: {
                  bookObjectId: {
                    $cond: [
                      { $eq: [{ $type: "$bookId" }, "string"] },
                      { $toObjectId: "$bookId" },
                      "$bookId"
                    ]
                  }
                }
              },
              {
                $lookup: {
                  from: "books",
                  localField: "bookObjectId",
                  foreignField: "_id",
                  as: "bookDetails"
                }
              },
              { $unwind: { path: "$bookDetails", preserveNullAndEmptyArrays: true } }
            ]).toArray();

            res.send(orders);
          } catch (err) {
            console.error("Error fetching librarian orders:", err);
            res.status(500).send({ error: "Failed to fetch orders" });
          }
        });

        // Cancel an order by order ID
        app.delete("/orders/:id", async (req, res) => {
          const { id } = req.params;

          try {
            const result = await ordersCollection.deleteOne({
              _id: new ObjectId(id)
            });

            if (result.deletedCount === 1) {
              res.send({ success: true, message: "Order cancelled successfully" });
            } else {
              res.status(404).send({ error: "Order not found" });
            }
          } catch (error) {
            console.error("Cancel order error:", error);
            res.status(500).send({ error: "Failed to cancel order" });
          }
        });
        // GET SINGLE ORDER BY ID WITH BOOK DETAILS
        app.get("/orders/:id", async (req, res) => {
          try {
            const id = req.params.id;

            if (!ObjectId.isValid(id)) return res.status(400).send({ error: "Invalid order ID" });

            const order = await ordersCollection.findOne({ _id: new ObjectId(id) });
            if (!order) return res.status(404).send({ error: "Order not found" });

            const bookId = ObjectId.isValid(order.bookId) ? new ObjectId(order.bookId) : order.bookId;
            const book = await booksCollection.findOne({ _id: bookId });

            if (!book) return res.status(404).send({ error: "Book not found" });

            res.send({
              ...order,
              book: {
                id: book._id,
                name: book.bookName,
                img: book.image || "",
                price: book.price,
              },
            });
          } catch (error) {
            console.error("Server error:", error);
            res.status(500).send({ error: error.message });
          }
        });

        // GET ORDERS FOR A LIBRARIAN WITH BOOK DETAILS
        app.get("/librarian/orders", async (req, res) => {
            try {
                const email = req.query.email;

                const orders = await ordersCollection
                    .aggregate([
                        {
                            $match: {
                                "librarianDetails.email": email
                            }
                        },

                        // convert bookId string → ObjectId
                        {
                            $addFields: {
                                bookObjectId: { $toObjectId: "$bookId" }
                            }
                        },

                        // JOIN with Books collection
                        {
                            $lookup: {
                                from: "books",
                                localField: "bookObjectId",
                                foreignField: "_id",
                                as: "bookDetails"
                            }
                        },

                        { $unwind: "$bookDetails" }
                    ])
                    .toArray();

                res.send(orders);
            } catch (error) {
                console.error("Error fetching librarian orders:", error);
                res.status(500).send({ error: "Failed to fetch orders" });
            }
        });
        // UPDATE ORDER STATUS
        app.patch("/orders/:id/status", async (req, res) => {
          const { id } = req.params;
          const { status } = req.body;

          if (!status) return res.status(400).send({ error: "Status is required" });

          try {
            const result = await ordersCollection.updateOne(
              { _id: new ObjectId(id) },
              { $set: { Orderstatus: status } } // <-- changed
            );
            res.send({ success: true, message: "Order status updated" });
          } catch (error) {
            console.error(error);
            res.status(500).send({ error: "Failed to update order status" });
          }
        });
        // CANCEL AN ORDER
        app.delete("/orders/:id", async (req, res) => {
          const { id } = req.params;

          try {
            const result = await ordersCollection.deleteOne({
              _id: new ObjectId(id)
            });

            if (result.deletedCount === 1) {
              res.send({ success: true, message: "Order cancelled successfully" });
            } else {
              res.status(404).send({ error: "Order not found" });
            }
          } catch (error) {
            console.error("Cancel order error:", error);
            res.status(500).send({ error: "Failed to cancel order" });
          }
        });

        // -------------------------
        // RECORD PAYMENT
        // -------------------------

        app.post("/payment/:orderId", async (req, res) => {
          const { orderId } = req.params;

          try {
            // Fetch order from DB
            const order = await ordersCollection.findOne({ _id: new ObjectId(orderId) });
            if (!order) return res.status(404).send({ error: "Order not found" });

            if (order.paymentStatus === "paid") {
              return res.status(400).send({ error: "Order already paid" });
            }

            // Amount in cents
            const amount = order.bookDetails?.price ? Math.round(order.bookDetails.price * 100) : 0;

            // Create payment intent
            const paymentIntent = await stripe.paymentIntents.create({
              amount,
              currency: "usd",
              metadata: { orderId: order._id.toString() },
            });

            res.send({
              clientSecret: paymentIntent.client_secret,
            });
          } catch (error) {
            console.error(error);
            res.status(500).send({ error: "Failed to create payment intent" });
          }
        });
        // CONFIRM PAYMENT AND UPDATE ORDER STATUS
        app.post("/payment/confirm", async (req, res) => {
          const { orderId, paymentIntentId } = req.body;

          try {
            const paymentRecord = {
              orderId,
              paymentIntentId,
              createdAt: new Date(),
            };

            await client.db("BookCourier").collection("payments").insertOne(paymentRecord);

            // Update order payment status
            await ordersCollection.updateOne(
              { _id: new ObjectId(orderId) },
              { $set: { paymentStatus: "paid" } }
            );

            res.send({ success: true, message: "Payment confirmed" });
          } catch (err) {
            console.error(err);
            res.status(500).send({ error: "Failed to confirm payment" });
          }
        });


        // -------------------------
        // CREATE CHECKOUT SESSION
        // -------------------------
        app.post('/create-checkout-session', async (req, res) => {
          const { orderId, customerEmail } = req.body;

          if (!orderId || !customerEmail) return res.status(400).send({ error: "Missing orderId or customerEmail" });

          try {
            const order = await ordersCollection.findOne({ _id: new ObjectId(orderId) });
            if (!order) return res.status(404).send({ error: "Order not found" });

            const book = await booksCollection.findOne({ _id: order.bookId });
            if (!book) return res.status(404).send({ error: "Book not found" });

            const session = await stripe.checkout.sessions.create({
              payment_method_types: ["card"],
              line_items: [{
                price_data: {
                  currency: "usd",
                  product_data: { name: book.bookName },
                  unit_amount: Math.round(book.price * 100)
                },
                quantity: 1
              }],
              mode: "payment",
              customer_email: customerEmail,
              metadata: { orderId: order._id.toString() },
              success_url: `${process.env.SITE_DOMAIN}/dashboard/payment-success?session_id={CHECKOUT_SESSION_ID}`,
              cancel_url: `${process.env.SITE_DOMAIN}/dashboard/payment-cancelled`
            });

            res.send({ url: session.url });

          } catch (err) {
            console.error(err);
            res.status(500).send({ error: err.message });
          }
        });

        // -------------------------
        // PAYMENT SUCCESS
        // -------------------------
        app.patch('/payment-success', async (req, res) => {
          const { session_id } = req.query;
          if (!session_id) return res.status(400).send({ error: "Session ID required" });

          try {
            const session = await stripe.checkout.sessions.retrieve(session_id);
            const orderId = session.metadata?.orderId;
            if (!orderId) return res.status(400).send({ error: "Order ID missing in session metadata" });

            const order = await ordersCollection.findOne({ _id: new ObjectId(orderId) });
            const book = await booksCollection.findOne({ _id: order.bookId });

            if (!order || !book) return res.status(404).send({ error: "Order or Book not found" });

            // Prevent duplicate payment records
            const existingPayment = await paymentsCollection.findOne({ transactionId: session.payment_intent });
            if (existingPayment) {
              return res.send({ success: true, transactionId: existingPayment.transactionId });
            }

            // Update order payment status
            await ordersCollection.updateOne(
              { _id: new ObjectId(orderId) },
              { $set: { paymentStatus: "paid" } }
            );

            // Insert payment record
            const paymentRecord = {
              orderId,
              transactionId: session.payment_intent,
              amount: session.amount_total / 100,
              currency: session.currency,
              paidAt: new Date(),
              customer: {
                name: order.customerDetails?.name,
                email: order.customerDetails?.email,
                photo: order.customerDetails?.photo || "https://via.placeholder.com/50"
              },
              product: {
                name: book.bookName,
                price: book.price,
                image: book.image
              }
            };

            const result = await paymentsCollection.insertOne(paymentRecord);

            res.send({
              success: true,
              transactionId: session.payment_intent,
              paymentInfo: result,
              orderId
            });

          } catch (err) {
            console.error(err);
            res.status(500).send({ error: err.message });
          }
        });

        // GET /payments?email=user@example.com
        app.get("/payments", async (req, res) => {
          const { email } = req.query;
          if (!email) return res.status(400).send({ error: "Email query required" });

          try {
            // Fetch all payments for this customer
            const payments = await paymentsCollection.find({ "customer.email": email }).toArray();

            // Fetch all books
            const books = await booksCollection.find().toArray();

            // Attach book info to each payment
            const paymentsWithBook = payments.map((payment) => {
              // Assume payment has a field productName or similar to match book
              const book = books.find((b) => b.bookName === payment.product?.name); 
              return { ...payment, book };
            });

            res.send(paymentsWithBook);
          } catch (err) {
            console.error(err);
            res.status(500).send({ error: "Failed to fetch payments" });
          }
        });

        // GET /admin/payments  (Admin only)
        // GET /admin/payments
        const { ObjectId } = require("mongodb");

        // GET /admin/payments
        app.get("/admin/payments", async (req, res) => {
          const { email } = req.query;
          if (!email) return res.status(400).send({ error: "Email query required" });

          try {
            // 1️⃣ Check if user is admin
            const admin = await usersCollection.findOne({ email });
            if (!admin || admin.role !== "admin")
              return res.status(403).send({ error: "Access denied" });

            // 2️⃣ Fetch all collections
            const payments = await paymentsCollection.find().toArray();
            const orders = await ordersCollection.find().toArray();
            const books = await booksCollection.find().toArray();
            const users = await usersCollection.find().toArray();

            // 3️⃣ Map payments → order → book → librarian
            const transactions = payments.map((p) => {
              const order = orders.find((o) => o._id.toString() === (p.orderId || ""));
              const book =
                order && order.bookId
                  ? books.find((b) => b._id.toString() === order.bookId.toString())
                  : null;

              const customer =
                users.find(
                  (u) =>
                    u._id.toString() === (p.customerId || "") ||
                    u.email === p.customer?.email
                ) || null;

              const librarian = book
                ? {
                    displayName: book.librarianName,
                    email: book.librarianEmail,
                    photoURL: book.librarianImage,
                    role: "librarian",
                  }
                : null;

              return {
                ...p,
                orderId: order?._id || null,
                book,
                librarian,
                customer,
                paidAt: p.paidAt,
                amount: p.amount,
                transactionId: p.transactionId,
              };
            });

            res.json(transactions);
          } catch (err) {
            console.error("Admin transactions error:", err);
            res.status(500).send({ error: "Failed to fetch admin transactions" });
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
