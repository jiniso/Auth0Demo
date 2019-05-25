const express = require('express');
const app = express();
const jwt = require('express-jwt');
const jwtAuthz = require('express-jwt-authz');
const jwksRsa = require('jwks-rsa');
const cors = require('cors');
const bodyParser = require('body-parser');
const timesheets = require('./fakeData').timesheets();
const _ = require('lodash');
const YAML = require('yamljs');
const swaggerUi = require('swagger-ui-express');
const replaceInFile = require('replace-in-file');
const copyFileSync = require('fs-copy-file-sync');
const helmet = require('helmet');  


loadEnvironment();
setupSwaggerFile();

app.use(helmet());

// Enable CORS
app.use(cors());

// Create middleware for checking the JWT
const checkJwt = jwt({
  // Dynamically provide a signing key based on the kid in the header and the singing keys provided by the JWKS endpoint.
  secret: jwksRsa.expressJwtSecret({
    cache: true,
    rateLimit: true,
    jwksRequestsPerMinute: 5,
    jwksUri: `${process.env.AUTH0_DOMAIN}/.well-known/jwks.json`
  }),

  // Validate the audience and the issuer.
  audience: process.env.AUTH0_AUDIENCE,
  issuer: `${process.env.AUTH0_DOMAIN}/`,
  algorithms: ['RS256']
});

// Enable the use of request body parsing middleware
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({
  extended: true
}));

// Batch upload endpoint
app.post('/timesheets/upload', checkJwt, jwtAuthz(['batch:upload']), function (req, res) {
  var timesheet = req.body;

  // determine id for new timesheet
  var max = Math.max(...timesheets.map(elt => elt.id))
  timesheet.id = max + 1;

  // append the timesheet
  timesheets.push(req.body);

  //send the response
  res.status(201).send(timesheet);
});

// create timesheets API endpoint
app.post('/timesheets', checkJwt, jwtAuthz(['create:timesheets']), function (req, res) {
  var timesheet = req.body;

  // determine id for new timesheet
  var max = Math.max(...timesheets.map(elt => elt.id))
  timesheet.id = max + 1;
  timesheet.user_id = req.user['https://api.exampleco.com/email'];
  timesheet.approved = false;

  // append the timesheet
  timesheets.push(req.body);

  //send the response
  res.status(201).send(timesheet);
});

// create timesheets API endpoint
app.get('/timesheets', checkJwt, jwtAuthz(['read:timesheets']), function (req, res) {
  // Get timesheet entries for this user
  var userEntries = timesheets.filter(entry => entry.user_id === req.user['https://api.exampleco.com/email']);

  //send the response
  res.status(200).send(userEntries);
});

app.put('/approvals/:id', checkJwt, jwtAuthz(['approve:timesheets']), function (req, res) {
  var entry = timesheets.filter(entry => entry.id == req.params.id)[0];
  entry.approved = true;

  //send the response
  res.status(200).send(entry);
});

app.get('/approvals', checkJwt, jwtAuthz(['approve:timesheets']), function (req, res) {
  var unapprovedEntries = timesheets.filter(entry => entry.approved == false);

  //send the response
  res.status(200).send(unapprovedEntries);
});

const swaggerDocument = YAML.load('./swagger.yml');
app.use('/', swaggerUi.serve, swaggerUi.setup(swaggerDocument));

app.listen(process.env.PORT);
console.log(`Listening on http://localhost:${process.env.PORT}`);

///////////////////////////////////////////////////////////////////
// Functions
///////////////////////////////////////////////////////////////////

function loadEnvironment() {  
  if (!process.env.AUTH0_DOMAIN && !process.env.AUTH0_AUDIENCE) {
    console.log('AUTH0_DOMAIN or AUTH0_AUDIENCE were not found in environment - fallback to .env file')
    require('dotenv').config();

    if (!process.env.AUTH0_DOMAIN || !process.env.AUTH0_AUDIENCE) {
      throw 'Make sure you have AUTH0_DOMAIN, and AUTH0_AUDIENCE in your .env file';
    } 
    
    console.log( `AUTH0_DOMAIN: ${process.env.AUTH0_DOMAIN}` );
    console.log( `AUTH0_AUDIENCE: ${process.env.AUTH0_AUDIENCE}` );
  }
}

function setupSwaggerFile() {
  const swaggerTemplatePath = './swagger.yml.template';
  const swaggerFilePath = './swagger.yml';

  copyFileSync( swaggerTemplatePath, swaggerFilePath );

  replaceInFile.sync({
    files: './swagger.yml',
    from: /AUTH0_DOMAIN/g,
    to: process.env.AUTH0_DOMAIN,
  });

  replaceInFile.sync({
    files: './swagger.yml',
    from: /AUTH0_AUDIENCE/g,
    to: process.env.AUTH0_AUDIENCE,
  });
}
