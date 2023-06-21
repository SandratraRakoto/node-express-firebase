require("dotenv").config();
const {onRequest} = require("firebase-functions/v2/https");
const express = require("express");
const axios = require("axios");
const cors = require("cors");
const bodyParser = require("body-parser");
const stripe = require("stripe")(process.env.STRIPE_API_KEY);
const sendGridClient = require("@sendgrid/mail");
sendGridClient.setApiKey(process.env.SENDGRID_API_KEY);
const allowedDomains = process.env.FONT_END_URL ?
process.env.FONT_END_URL.split(","): [];

const app = express();
app.use(cors({
  origin: allowedDomains.length? allowedDomains: "*",
}));
app.use(bodyParser.json());

const blockUnknownDomains = (req, res, next)=> {
  const requestOrigin = req.headers.origin;
  if (!allowedDomains.length) {
    next();
  } else if (allowedDomains.includes(requestOrigin)) {
    next();
  } else {
    res.status(403).json({error: "Access Forbidden"});
  }
};
app.use(blockUnknownDomains);

app.get("/", (req, res) => {
  res.json({message: "This is the backend server deployed as function"});
});
// API for geting Stripe Authorization code of user
app.get("/api/stripe/authorization/:code", async (req, res) => {
  try {
    const response = await axios.post(
        "https://connect.stripe.com/oauth/token",
        {
          client_secret: process.env.STRIPE_API_KEY,
          code: req.params.code,
          grant_type: "authorization_code",
        },
    );
    res.json(response.data);
  } catch (error) {
    console.error(error);
    res.status(404).json({message: "User code not found"});
  }
});

app.post("/api/stripe/checkout/session", async (req, res) => {
  try {
    const requestData = req.body;
    const session = await stripe.checkout.sessions.create({
      line_items: [
        {
          price_data: {
            currency: requestData.currency,
            unit_amount_decimal: requestData.unit_amount_decimal,
            product_data: {
              name: requestData.name,
              description: requestData.description,
            },
          },
          quantity: 1,
        },
      ],
      mode: "payment",
      success_url: requestData.success_url,
      cancel_url: requestData.cancel_url,
    });
    res.json(session);
  } catch (error) {
    console.error(error);
    res.status(500).json(error);
  }
});

app.post("/api/stripe/subscription", async (req, res) => {
  try {
    const session = await stripe.checkout.sessions.create({
      line_items: [
        {
          price: req.body.price,
          quantity: 1,
        },
      ],
      mode: "subscription",
      success_url: req.body.success_url,
      cancel_url: req.body.cancel_url,
    });
    res.json(session);
  } catch (error) {
    console.error(error);
    res.status(500).send("Internal Server Error");
  }
});

// API for geting Sending email
app.post("/api/sendgrid/email", async (req, res) => {
  try {
    const message = {
      personalizations: [
        {
          to: [
            {
              email: req.body.to.email,
              name: req.body.to.name,
            },
          ],
          subject: req.body.subject,
        },
      ],
      from: {
        email: req.body.from.email,
        name: req.body.from.name,
      },
      replyTo: {
        email: req.body.from.email,
        name: req.body.from.name,
      },
      subject: req.body.subject,
      content: [
        {
          type: "text/html",
          value: req.body.content,
        },
      ],
    };

    sendGridClient
        .send(message)
        .then(() => {
          console.log("Mail sent successfully");
          res.json({message: "Email send successfully."});
        })
        .catch((error) => {
          console.error(error);
          res.status(400).json(error);
        });
  } catch (error) {
    console.error(error);
    res.status(500).send("Internal Server Error");
  }
});

const PORT = process.env.API_PORT || 3000;

app.listen(PORT, () => {
  console.log("Server running at ", PORT);
});

exports.app = onRequest(app);
