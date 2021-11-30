const express = require('express');
const cors = require('cors');
require('dotenv').config();
const fileUpload = require('express-fileupload');
const { MongoClient } = require('mongodb');
const ObjectId = require('mongodb').ObjectId;
const stripe = require("stripe")('sk_test_51Jxv1lDfbc3HDpGtPh5kmDEfy88jHS2WiOqzF9BKFi1aXah9eE7JuyiWW2k5nlPtWjfcmVUr6Q2S70PdjwJSamLA00F0OzevK0');
var admin = require("firebase-admin");
var serviceAccount = require("./serviceAccount.json");

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
});
async function verifyToken(req, res, next) {
    if (req.headers?.authorization?.startsWith('Bearer ')) {
        const token = req.headers.authorization.split(' ')[1];

        try {
            const decodedUser = await admin.auth().verifyIdToken(token);
            req.decodedEmail = decodedUser.email;
        }
        catch {

        }

    }
    next();
}

const app = express();
app.use(cors());
app.use(express.json());
app.use(fileUpload());

const port = process.env.PORT || 500;

//mongodb
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.wuxif.mongodb.net/myFirstDatabase?retryWrites=true&w=majority`;
const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true });

app.get('/', (req, res) => {
    res.json('Jenkins-Parlour server');
})
async function run() {
    try {
        await client.connect();
        const database = client.db("jenkins-parlour");
        const usersCollection = database.collection("users");
        const productsCollection = database.collection("products");
        const ordersCollection = database.collection("orders");

        //POST API for products
        app.post('/products', async (req, res) => {
            const name = req.body.name;
            const desc = req.body.desc;
            const price = req.body.price;
            const image = req.files.image;
            const imageData = image.data;
            const encodedImage = imageData.toString('base64');
            const imageBuffer = Buffer.from(encodedImage, 'base64');

            const product = { name: name, price: price, desc: desc, image: imageBuffer };
            const result = await productsCollection.insertOne(product);
            console.log('A product has been inserted!');
            res.json(result);
        })

        //GET API for products
        app.get('/products', async (req, res) => {
            const pointer = productsCollection.find({});
            const result = await pointer.toArray();
            res.json(result);
        })
        app.get('/products/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: ObjectId(id) };
            const result = await productsCollection.findOne(query);
            res.json(result);
        })

        //DELETE API for products
        app.delete('/products/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: ObjectId(id) };
            const result = await productsCollection.deleteOne(query);
            console.log('An Item has been deleted!');
            res.json(result);
        })

        //Update API for products
        app.put('/products/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: ObjectId(id) };
            let doc;
            doc = { $set: { name: req.body.name, price: req.body.price, desc: req.body.desc } };
            const result = await productsCollection.updateOne(query, doc);
            console.log('A product has been updated!', result.modifiedCount);
            res.json(result);
        })

        //orders
        app.post('/orders', async (req, res) => {
            const order = req.body;
            const result = await ordersCollection.insertOne(order);
            console.log('A order has been inserted!');
            res.json(result);
        })
        app.get('/orders', async (req, res) => {
            const cursor = ordersCollection.find({});
            const result = await cursor.toArray();
            res.json(result);
        })
        app.get('/orders/forpayment/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: ObjectId(id) };
            const result = await ordersCollection.findOne(query);
            res.json(result);
        })
        app.get('/orders/:email', async (req, res) => {
            const email = req.params.email;
            const query = { email: email };
            const cursor = ordersCollection.find(query);
            const result = await cursor.toArray();
            console.log('Orders Obtained by email!');
            res.json(result);
        })
        app.delete('/orders/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: ObjectId(id) };
            const result = await ordersCollection.deleteOne(query);
            console.log('An Order has been deleted!');
            res.json(result);
        })
        app.put('/orders/:id', async (req, res) => {
            const id = req.params.id;
            const paymentInfo = req.body;
            const filter = { _id: ObjectId(id) };
            const updateDoc = { $set: { pay: paymentInfo } };
            const result = await ordersCollection.updateOne(filter, updateDoc);
            console.log('One order has been paid for!');
            res.json(result);
        })
        app.put('/orders/updateStatus/:id', async (req, res) => {
            const id = req.params.id;
            const data = req.body;
            const filter = { _id: ObjectId(id) };
            const updateDoc = { $set: { status: data.status } };
            const result = await ordersCollection.updateOne(filter, updateDoc);
            console.log('Status has been updated!');
            res.json(result);
        })
        //users
        app.post('/users', async (req, res) => {
            const user = req.body;
            const result = await usersCollection.insertOne(user);
            console.log('A user has been inserted with name & email--->', user);
            res.json(result);
        })
        app.put('/users', async (req, res) => {
            const user = req.body;
            const filter = { email: user.email };
            const options = { upsert: true };
            const updateDoc = { $set: user };
            const result = await usersCollection.updateOne(filter, updateDoc, options);
            res.json(result);
        })

        app.get('/users/:email', async (req, res) => {
            const emailInfo = req.params.email;
            const query = { email: emailInfo };
            const user = await usersCollection.findOne(query);
            let isAdmin = false;
            if (user?.role === 'admin') {
                isAdmin = true;
            }
            res.json({ admin: isAdmin });
        })

        app.put('/users/admin', verifyToken, async (req, res) => {
            const info = req.body;
            const requester = req.decodedEmail;
            if (requester) {
                const requesterAccount = await usersCollection.findOne({ email: requester });
                if (requesterAccount.role === 'admin') {
                    const filter = { email: info.email };
                    const updateDoc = { $set: { role: 'admin' } };
                    const result = await usersCollection.updateOne(filter, updateDoc);
                    console.log('Role of an user has been updated to admin!-->', result.modifiedCount);
                    res.json(result);
                }
            }
            else {
                res.status(403).json({ message: 'you do not have access to make admin' })
            }
        })

        //payment via stripe
        app.post("/create-payment-intent", async (req, res) => {
            const paymentInfo = req.body;
            const amount = parseFloat(paymentInfo.price.substring(1)) * 100;

            const paymentIntent = await stripe.paymentIntents.create({
                amount: amount,
                currency: "usd",
                automatic_payment_methods: {
                    enabled: true,
                },
            });
            res.json({ clientSecret: paymentIntent.client_secret });
        })
    }
    finally {

    }
}
run().catch(console.dir);
app.listen(port, () => {
    console.log(`Listen at http://localhost:${port}`);
})
