const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const express = require('express');
var jwt = require('jsonwebtoken');
const app = express();
const cors = require('cors');
require('dotenv').config();
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const port = process.env.PORT || 5000;


app.use(cors())
app.use(express.json())


const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.0lvo8.mongodb.net/myFirstDatabase?retryWrites=true&w=majority`;

const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true, serverApi: ServerApiVersion.v1 });


function verifyJWT(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
        return res.status(401).send({ message: 'UnAuthorized access' });
    }
    const token = authHeader.split(' ')[1];
    jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, function (err, decoded) {
        if (err) {
            err = {
                name: 'TokenExpiredError',
                message: 'jwt expired',
                expiredAt: 1408621000
            }
        }
        req.decoded = decoded;
        next();
    });
}

async function run() {
    try {
        await client.connect()
        const serviceCollection = client.db('doctor-portal-db').collection('service');
        const bookingCollection = client.db('doctor-portal-db').collection('booking');
        const userCollection = client.db('doctor-portal-db').collection('user');
        const doctorCoolection = client.db('doctor-portal-db').collection('doctor');
        const paymentCoolection = client.db('doctor-portal-db').collection('payment');


        const verifyAdmin = async (req, res, next) => {
            const email = req.decoded.email;
            const requester = await userCollection.findOne({ email: email })
            if (requester.role === 'admin') {
                next()
            }
            else {
                res.status(403).send({ message: 'forbidden' })
            }
        }


        app.get('/treatment', async (req, res) => {
            const query = {}
            const cursor = serviceCollection.find(query).project({ name: 1 });
            const service = await cursor.toArray()
            res.send(service)
        })

        app.get('/available', async (req, res) => {
            const date = req.query.date;

            // step 1:  get all services
            const services = await serviceCollection.find().toArray();

            // step 2: get the booking of that day. output: [{}, {}, {}, {}, {}, {}]
            const query = { date: date };
            const bookings = await bookingCollection.find(query).toArray();

            // step 3: for each service
            services.forEach(service => {
                // step 4: find bookings for that service. output: [{}, {}, {}, {}]
                const serviceBookings = bookings.filter(book => book.treatment === service.name);
                // step 5: select slots for the service Bookings: ['', '', '', '']
                const bookedSlots = serviceBookings.map(book => book.slot);
                // step 6: select those slots that are not in bookedSlots
                const available = service.slots.filter(slot => !bookedSlots.includes(slot));
                //step 7: set available to slots to make it easier 
                service.slots = available;
            });


            res.send(services);
        })

        app.get('/booking/:appId', verifyJWT, async (req, res) => {
            const appId = req.params.appId;
            const filter = { _id: ObjectId(appId) }
            const result = await bookingCollection.findOne(filter);
            res.send(result)


        });


        app.post('/booking', async (req, res) => {
            const booking = req.body;

            const query = { treatment: booking.treatment, date: booking.date, patientEmail: booking.patientEmail }
            const exists = await bookingCollection.findOne(query);
            if (exists) {
                return res.send({ success: false, booking: exists })
            }
            const result = await bookingCollection.insertOne(booking);
            return res.send({ success: true, result });
        })





        app.get('/booking', async (req, res) => {
            const paitent = req.query.paitent;
            const bookings = await bookingCollection.find({ patientEmail: paitent }).toArray()
            return res.send(bookings)

        })

        //patch api for update booking
        app.patch('/booking/:id', verifyJWT, async (req, res) => {
            const id = req.params.id;
            const payment = req.body;
            const filter = { _id: ObjectId(id) };
            const updateDoc = {
                $set: {
                    paid: true,
                    transactionId: payment.transactionId

                }
            }
            const result = await paymentCoolection.insertOne(payment);
            const updateBooking = await bookingCollection.updateOne(filter, updateDoc)
            res.send(updateBooking)
        })

        //delete booking appointment
        app.delete('/booking', verifyJWT, async (req, res) => {
            const id = req.query.id;
            const filter = { _id: ObjectId(id) }
            const result = await bookingCollection.deleteOne(filter);
            res.send(result)

        })

        //payment_intent_api
        app.post('/create-payment-intent', verifyJWT, async (req, res) => {
            const service = req.body;
            const price = service.price;
            const amount = price * 100
            const paymentIntent = await stripe.paymentIntents.create({
                amount: amount,
                currency: "usd",
                payment_method_types: ['card']

            });
            console.log(paymentIntent)
            res.send({ clientSecret: paymentIntent?.client_secret })
        })

        app.put('/user/:email', async (req, res) => {

            const email = req.params.email;
            const user = req.body;
            const filter = { email: email };
            const options = { upsert: true };
            const updateDoc = {
                $set: user
            }
            const result = await userCollection.updateOne(filter, updateDoc, options)
            const token = jwt.sign({ email: email }, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '12d' })
            res.send({ result, token })

        })

        app.get('/admin/:email', async (req, res) => {
            const email = req.params.email;
            const user = await userCollection.findOne({ email: email })
            const isAdmin = user?.role === 'admin';
            res.send({ admin: isAdmin })
        })

        app.put('/user/admin/:email', verifyJWT, verifyAdmin, async (req, res) => {
            const email = req.params.email;
            const requester = req.decoded?.email;
            const requesterInfo = await userCollection.findOne({ email: requester });

            const filter = { email: email };
            const updateDoc = {
                $set: { role: 'admin' }
            }

            const result = await userCollection.updateOne(filter, updateDoc)
            res.send(result)


        })


        app.get('/user', verifyJWT, verifyAdmin, async (req, res) => {
            const users = await userCollection.find().toArray();
            res.send(users);
        });
        app.get('/doctor', verifyJWT, async (req, res) => {

            const result = await doctorCoolection.find().toArray()
            res.send(result)
        })


        app.post('/doctor', verifyJWT, async (req, res) => {
            const doctor = req.body;
            const result = await doctorCoolection.insertOne(doctor);
            res.send(result)
        })

        app.delete('/doctor/:email', async (req, res) => {
            const email = req.params.email;
            const result = await doctorCoolection.deleteOne({ email: email })
            res.send(result)

        })

    }
    finally {

    }

}
run().catch(console.dir)

app.get('/', (req, res) => {
    res.send('server okay')
})
app.listen(port, () => {
    console.log('server running at', port)
})