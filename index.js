const { MongoClient, ServerApiVersion } = require('mongodb');
const express = require('express');
const app = express();
const cors = require('cors');
require('dotenv').config();
const port = process.env.PORT || 5000;


app.use(cors())
app.use(express.json())


const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.0lvo8.mongodb.net/myFirstDatabase?retryWrites=true&w=majority`;

const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true, serverApi: ServerApiVersion.v1 });

async function run() {
    try {
        await client.connect()
        const serviceCollection = client.db('doctor-portal-db').collection('service');
        const bookingCollection = client.db('doctor-portal-db').collection('booking');


        app.get('/treatment', async (req, res) => {
            const query = {}
            const cursor = serviceCollection.find(query);
            const service = await cursor.toArray()
            res.send(service)
        })


        app.post('/booking', async (req, res) => {
            const booking = req.body;
            const query = { patientEmail: booking.patientEmail, date: booking.date, treatment: booking.treatment }
            const exists = await bookingCollection.findOne(query)
            if (exists) {
                return res.send({ success: false, booking: exists })
                alert('your booking exists')
            }
            const result = await bookingCollection.insertOne(booking)
            res.send({ success: true, result })
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