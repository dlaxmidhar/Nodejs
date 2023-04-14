const {ApolloServer, gql} = require('apollo-server');
const nodemailer = require('nodemailer');
const {auth} = require('./firebase');
const {DocumentStore} = require('ravendb');
const crypto = require('crypto');
const { join } = require('path');
const { readFileSync } = require('fs');

// read the certificate file and convert it to a buffer
const certificate = readFileSync('onlinedb.pfx');
const authOptions = {
  certificate: certificate,
  type: 'pfx',  // or "pem"
  password: '93EE9D996433A0E1B61FF03749B2AFC7'
};
const store = new DocumentStore(['https://a.free.rmanojcei.ravendb.cloud'], 'TestEmployee', authOptions);
store.initialize();

// Define the GraphQL schema
const typeDefs = gql` type Query {
  SendEmailQuery(email: String): String 
  cred(userotp: String, email: String) : String
}
`;
// Generate a 6-digit code
const generateOTP = () => {
  const chars = '0123456789';
  let otp = '';
  for (let i = 0; i < 6; i++) {
    otp += chars[Math.floor(Math.random() * chars.length)];
  }
  return otp;
};
// Define the resolvers
const resolvers = {
  Query: {
    SendEmailQuery: async (parent, {email}) => {
      try {
        const session = store.openSession();
        const matchingDoc = await session
          .query({ collection: 'OTP'})
          .whereEquals('email', email)
          .firstOrNull();
    
        const otp = generateOTP();
        const hash = crypto.createHash('sha256').update(otp).digest('hex');
        const transporter = nodemailer.createTransport({
          host: 'smtp.gmail.com',
          port: 587,
          secure: false,
          auth: {
            user: 'ceiauthenticate@gmail.com',
            pass: 'hxxjwtqusjrivaqi'
          }
        });
    
        const image = readFileSync(join(__dirname, "bc.jpeg"), {
          encoding: 'base64'
        });
        const imageDataUrl = `data:image/jpeg;base64,${image}`;
    
        const mailBody = `
          <html>
          <html>
          <head>
            <style>

            
            body {
              font-family: Arial, sans-serif;
              font-size: 14px;
              color: #444444;
              line-height: 1.5;
              background: url(${imageDataUrl}) no-repeat center center fixed;
              -webkit-background-size: cover;
              -moz-background-size: cover;
              -o-background-size: cover;
              background-size: cover;
            }
            /* Mobile styles */
              @media (max-width: 600px) {
                body {
                  background: none;
                }
                .background-image {
                  position: absolute;
                  top: 0;
                  left: 0;
                  width: 100%;
                  height: 100%;
                  z-index: -1;
                  background-size: cover;
                  background-position: center center;
                }
              }
              /* Desktop Styles*/
              @media (min-width: 768px) {
                .background-image {
                  display: none;
                }
                body{
                  font-size: 16px;
                }
                
              }
              .container {
                max-width: 600px;
                margin: 0 auto;
                padding: 30px;
              }
              
              .header {
                text-align: center;
                margin-bottom: 30px;
              }
              .header h1 {
                font-size: 28px;
                color: #333333;
                margin: 0;
              }
              .content {
                background-color: #ffffff;
                border-radius: 5px;
                box-shadow: 0px 5px 10px rgba(0, 0, 0, 0.1);
                padding: 30px;
                margin-bottom: 30px;
              }
              .otp {
                font-size: 24px;
                font-weight: bold;
                color: #0099cc;
                margin-top: 0;
              }
              .footer {
                text-align: center;
                color: #999999;
                font-size: 12px;
              }
              
            </style>
          </head>
          <body>
            <div class="background-image">
              <img src="${imageDataUrl}" />
            </div>
            <div class="container">   
              <div class="header">
                <h1>CEI America</h1>
              </div>
              <div class="content">
                <p>Dear User,</p>
                <p>We hope this email finds you well.</p>
                <p>We have received a request to verify your email address for your CEI account. To complete the verification process, please enter the following One-Time Password (OTP) on the verification page:</p>
                <p class="otp">${otp}</p>
                <p>Please note that this OTP is valid for only 10 minutes for security reasons. If you have not requested this verification or have any concerns, please contact our customer support team immediately.</p>
                <p>Thank you for choosing CEI America. We appreciate your business and look forward to providing you with a seamless experience.</p>
              </div>
              <div class="footer">
                <p>&copy; CEI America 2023. All rights reserved.</p>
              </div>
            </div>
          </body>
        </html>
          </html>
        `;
    
        const info = await transporter.sendMail({
          from: 'ceiauthenticate@gmail.com',
          to: email,
          subject: 'CEI America Email Verification',
          html: mailBody
        });
    
        console.log(`Message sent to ${email}: ${info.messageId}`);
        console.log(`OTP for ${email}: ${otp}`);
        if (matchingDoc) {
          matchingDoc.otp = hash;
          matchingDoc.timestamp = new Date();
          matchingDoc['@metadata']['@expires'] = new Date(Date.now() + 1 * 60 * 1000).toISOString();
          await session.saveChanges();
          console.log(`OTP value updated for document with email ${email}`);
        } else {
          const newDoc = {
            email: email,
            otp: hash,
            timestamp: new Date(),
            '@metadata': {
              '@collection': 'OTP',
              '@expires': new Date(Date.now() + 1 * 60 * 1000).toISOString(),
              '@nested-object-types': {},
              'Raven-Node-Type': null
            }
          };
          session.store(newDoc, `OTP/${email}`);
          await session.saveChanges();
          console.log(`New OTP document created with email ${email}`);
        }

      } catch (error) {
        console.error(error);
        throw new Error('Failed to send email');
      }
    },
    cred : async (parent, { userotp, email }) => {
      try {
        if(userotp ==""){
          return "Invalid OTP";
        }
        console.log('User entered OTP:', userotp, 'Email:', email);
    
        // Fetch matching OTP document from RavenDB
        const session = store.openSession();
        const matchingDoc = await session
          .query({ collection: 'OTP' })
          .whereEquals('email', email)
          .firstOrNull();
    
        if (!matchingDoc) {
          throw new Error('Expired OTP');
        }
    
        // Compare OTP values and time difference
        const dbotp = matchingDoc.otp;
        console.log("otpdb:"+dbotp);

        const timestamp = matchingDoc.timestamp;
        
        if (dbotp !== crypto.createHash('sha256').update(userotp).digest('hex') || userotp==null) {
          throw new Error('Invalid OTP');
        }     
        /*// Fetch or create user in Firebase Auth
        const userRecord = await auth.getUserByEmail(email).catch((error) => {
          console.error(error);
          throw new Error('Failed to get user record');
        });
    
        const uid = userRecord.uid;
    
        // Generate custom token
        const cToken = await auth.createCustomToken(uid).catch((error) => {
          console.error(error);
          throw new Error('Failed to create custom token');
        });
    
        console.log('Custom Token:', cToken);
        matchingDoc.otp = undefined;
        await session.saveChanges();
        return cToken;*/
        session.delete(matchingDoc);
        await session.saveChanges();
        var user = {
          uid: null,
          isPresent: false,
      };
      await auth.getUserByEmail(email)
          .then((userRecord) => {
              console.log(userRecord);
              user.uid = userRecord.toJSON().uid;
              user.isPresent = true;
          })
          .catch((error) => {
              console.log(error);
              user.isPresent = false;
          });
      console.log(user);
      
      if (user.isPresent) {
          console.log("creating custom Token this is here!!");
          await auth.createCustomToken(user.uid)
              .then((cToken) => {
                  console.log("I am in this function " + cToken);
                  ctokenfinal = cToken;
                  return "Custom token created";
              })
              .catch((error) => {
                  console.log(error);
                  throw new Error("Failed to create custom token");
              });
          
          return ctokenfinal;
      } else {
          await auth.createUser({
                  email: email,
                  emailVerified: true,
                  displayName: email,
              })
              .then((userRecord) => {
                  user.uid = userRecord.toJSON().uid;
                  user.isPresent = true;
              })
              .catch((error) => {
                  throw new Error(error.message);
              });
              
          await auth.createCustomToken(user.uid)
              .then((cToken) => {
                  console.log("Custom Token in here: " + cToken);
                  ctokenfinal = cToken;
                  return "Custom token created";
              })
              .catch((error) => {
                  throw new Error("Failed to create custom token");
              }); 
          return ctokenfinal;
          
      }
      } catch (error) {
        console.error(error);
        return error.message;
      }
    }
  }
};

// Create the Apollo Server
const server = new ApolloServer({typeDefs, resolvers});  // Start the server
server.listen().then(({server}) => {
  console.log(`🚀 Server ready at $ { server }`);
});