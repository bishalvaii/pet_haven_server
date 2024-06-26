const express = require('express');
const bodyParser = require('body-parser');
const { Pool } = require('pg');
const cors = require('cors')
const multer = require('multer');
const path = require('path');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');
const { v4: uuidv4 } = require('uuid');
const app = express();
app.use(cors()); // Use the cors middleware
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use('/images', express.static('images'))


const otpGenerator = require('otp-generator');



// Create a pool to manage database connections
const pool = new Pool({
  user: 'postgres',
  host: 'localhost',
  database: 'pet_haven',
  password: 'admin',
  port: 5432, // Default PostgreSQL port

});

//create a nodemailer using smtp transport
const transporter = nodemailer.createTransport({
  host: 'smtp.gmail.com',
  port: 587,
  secure: false,
  auth: {
    user: "yurisha.acharya.a21.2@icp.edu.np",
    pass: 'rdtj bjan dszz ddvs'
  },
  debug: true

})

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, path.join(__dirname, 'images'))
  },
  filename: function (req, file, cb) {
    const ext = path.extname(file.originalname);
    const filename = uuidv4() + ext;
    cb(null, filename)
  }
})

const upload = multer({ storage: storage })

// Signup route
app.post('/api/signup', async (req, res) => {
  try {
    // Retrieve user data from the request body
    const { username, email, password, full_name, phone_number } = req.body;

    //generate otp code
    const otpCode = otpGenerator.generate(4, { digits: true, alphabets: false, upperCase: false, specialChars: false });


    // Insert user data into the database
    const client = await pool.connect();
    const query = `
          INSERT INTO users (username, email, password, full_name, phone_number, otp_code)
          VALUES ($1, $2, $3, $4, $5, $6)
        `;
    const values = [username, email, password, full_name, phone_number, otpCode]; // Note: Password should be hashed in production
    await client.query(query, values);
    client.release();

    // send otp code to the user via emai
    const mailOptions = {
      from: 'yurisha.acharya.a21.2@icp.edu.np',
      to: email,
      subject: 'OTP Verification',
      text: `Your OTP code is: ${otpCode}`,
    }
    console.log(mailOptions)

    transporter.sendMail(mailOptions, (error, info) => {
      if (error) {
        console.error('Email Error:', error);
        res.status(500).json({ error: 'Failed to send OTP email' });
      } else {
        console.log('Email Sent:', info.response);
        res.status(200).json({ message: 'Signup successful' });
      }
    })


  } catch (error) {
    // Handle errors
    console.error('Signup Error:', error);
    res.status(500).json({ error: 'Signup failed' });
  }



});

// GET /api/users
app.get('/api/users', async (req, res) => {
  try {
    // Fetch users from the database
    const users = await pool.query('SELECT * FROM users');

    // Return the list of users
    res.json(users.rows);
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/add-users', async (req, res) => {
  try {
    // Retrieve user data from the request body
    const { username, email, password, full_name, phone_number, isAdmin } = req.body;

    // Insert user data into the database
    const query = `
      INSERT INTO users (username, email, password, full_name, phone_number, isAdmin)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *;
    `;
    const values = [username, email, password, full_name, phone_number, isAdmin];
    const result = await pool.query(query, values);
    console.log(result.rows[0])

    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('Error adding user:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});


// Route to fetch all rescue requests
app.get('/get-rescue-requests', async (req, res) => {
  try {
    // Execute SQL query to select all rescue requests
    const result = await pool.query('SELECT * FROM rescue_requests');

    // Send response with the retrieved data
    res.status(200).json(result.rows);
  } catch (error) {
    console.error('Error fetching rescue requests:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

//OTP verification route
app.post('/api/verify-otp', async (req, res) => {
  try {
    const { email, otp } = req.body;
    const client = await pool.connect();
    const query = `SELECT otp_code FROM users WHERE email=$1`;
    const result = await client.query(query, [email]);
    client.release();

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' })
    }

    const storedOtp = result.rows[0].otp_code;
    if (otp === storedOtp) {
      res.status(200).json({ message: "OTP verified successfully" });
    } else {
      res.status(401).json({ error: 'Invalid OTP' });
    }
  } catch (error) {
    // Handle errors
    console.error('OTP Verification Error:', error);
    res.status(500).json({ error: 'OTP verification failed' });
  }
})

// Authentication route
app.post('/api/login', async (req, res) => {
  try {
    // Retrieve user credentials from the request body
    const { username, password } = req.body;

    // Query the database to check if the user exists and the password is correct
    const client = await pool.connect();
    const query = `
          SELECT * FROM users WHERE username = $1 AND password = $2
        `;
    const result = await client.query(query, [username, password]);
    client.release();

    // If a matching user is found, return a success response
    if (result.rows.length > 0) {
      const payload = {
        username: result.rows[0].username,
        isAdmin: result.rows[0].isadmin // Include additional user info as needed
      };

      // Generate JWT token with a secret key and expiration time (e.g., 1 hour)
      const token = jwt.sign(payload, 'your_secret_key', { expiresIn: '1h' });

      res.status(200).json({ message: 'Login successful', token: token });
    } else {
      // If no matching user is found, return an error response
      res.status(401).json({ error: 'Invalid email or password' });
    }
  } catch (error) {
    // Handle errors
    console.error('Login Error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
});

app.get('/api/isadmin', async (req, res) => {
  try {
    const { username } = req.query;
    // Query the database to check if the user is an admin
    const client = await pool.connect();
    const query = `
          SELECT isadmin FROM users WHERE username = $1
        `;
    const result = await client.query(query, [username]);
    client.release();

    // If the user is an admin, return true; otherwise, return false
    if (result.rows.length > 0) {
      res.status(200).json({ isAdmin: result.rows[0].isadmin });
    } else {
      res.status(404).json({ error: 'User not found' });
    }
  } catch (error) {
    console.error('Error checking isAdmin:', error);
    res.status(500).json({ error: 'Failed to check isAdmin' });
  }
});


app.post('/change_password', async (req, res) => {
  const { username, oldPassword, newPassword } = req.body;

  try {
    // Fetch user from the database
    const user = await pool.query('SELECT * FROM users WHERE username = $1', [username]);

    if (user.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const dbPassword = user.rows[0].password;

    // Check if the old password matches the password in the database
    if (oldPassword !== dbPassword) {
      return res.status(400).json({ error: 'Old password is incorrect' });
    }

    // Update the password in the database
    await pool.query('UPDATE users SET password = $1 WHERE username = $2', [newPassword, username]);

    res.status(200).json({ message: 'Password changed successfully' });
  } catch (error) {
    console.error('Error changing password:', error);
    res.status(500).json({ error: 'Failed to change password' });
  }
});


//rescue endpoint

app.post('/submit-rescue-details', upload.single('image'), async (req, res) => {
  try {
    const { username, name, location, description, age, gender, phoneNumber } = req.body;
    const image_url = req.file ? `/images/${req.file.filename}` : '';
    console.log("Image url:", image_url)
    console.log("Username:", username)
    // Assuming the frontend sends the image file as 'image'



    // Insert rescue details into the database without storing the image URL
    const query = `
          INSERT INTO rescue_requests (username,name, location, image_filename, description,age, gender, phone_number)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
          RETURNING *;
        `;

    const values = [username, name, location, image_url, description, age, gender, phoneNumber];
    const result = await pool.query(query, values);

    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('Error submitting rescue details:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// Endpoint to retrieve rescue requests for a specific user
app.get('/rescue_requests', async (req, res) => {
  const { username } = req.query;

  try {
    // Query the rescue_requests table for requests with the specified username
    const query = 'SELECT * FROM rescue_requests WHERE username = $1';
    const { rows } = await pool.query(query, [username]);

    res.json(rows);
  } catch (error) {
    console.error('Error fetching rescue requests:', error);
    res.status(500).json({ error: 'Failed to fetch rescue requests' });
  }
});


app.get('/adapt', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT dog_image, dog_name, gender, location,dog_age FROM adoptions');
    const dogsWithPrices = rows.map(dog => {
      let price = Math.floor(Math.random() * (3000 - 1000 + 1)) + 1000; // Generate random price between 1000 and 3000
      while (price % 5 !== 0 || price % 10 !== 0) {
        price = Math.floor(Math.random() * (3000 - 1000 + 1)) + 1000;
      }
      return {
        ...dog,
        adoptionPrice: price
      };
    });
    res.json(dogsWithPrices);
    console.log(dogsWithPrices);
  } catch (error) {
    console.error('Error fetching dog data:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/adoption', async (req, res) => {
  const { username, dogName, dogAge, gender, description, dogImage, price, productId, paidPrice } = req.body;

  try {
    // Fetch location from rescue_requests table based on dogName
    const rescueResult = await pool.query(
      'SELECT location FROM rescue_requests WHERE name = $1',
      [dogName]
    );

    if (rescueResult.rows.length === 0) {
      return res.status(404).json({ error: 'Location not found for the specified dog' });
    }

    const location = rescueResult.rows[0].location;

    // Insert adoption details into adoptions table
    const adoptionResult = await pool.query(
      'INSERT INTO adoptions (username, dog_name, dog_age, gender, description, dog_image, price, product_id, paid_price, location) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)',
      [username, dogName, dogAge, gender, description, dogImage, price, productId, paidPrice, location]
    );

    if (adoptionResult.rowCount > 0) {
      res.status(200).send('Adoption details stored successfully.');
    } else {
      res.status(401).json({ error: 'Sorry, unable to store adoption details' });
    }
  } catch (error) {
    console.error('Error storing adoption details:', error);
    res.status(500).send('Internal server error');
  }
});

app.post('/user-adoptions', async (req, res) => {
  const { username, dog_name, dog_age, gender, description, price } = req.body;

  try {
    // Insert adoption details into user_adoptions table
    const adoptionResult = await pool.query(
      'INSERT INTO user_adoptions (username, dog_name, dog_age, gender, description, price) VALUES ($1, $2, $3, $4, $5, $6)',
      [username, dog_name, dog_age, gender, description, price]
    );

    if (adoptionResult.rowCount > 0) {
      console.log('Adoption details stored successfully:', adoptionResult.rows[0]);
      res.status(200).send('Adoption details stored successfully.');
    } else {
      console.error('Failed to store adoption details:', adoptionResult);
      res.status(401).json({ error: 'Sorry, unable to store adoption details' });
    }
  } catch (error) {
    console.error('Error storing adoption details:', error);
    res.status(500).send('Internal server error');
  }
});

app.post('/user-rescues', async (req, res) => {
  const { username, name, age, gender, description } = req.body;

  try {
    // Insert adoption details into user_adoptions table
    const rescueResult = await pool.query(
      'INSERT INTO user_rescues (username, dog_name, dog_age, gender, description) VALUES ($1, $2, $3, $4, $5)',
      [username, name, age, gender, description]
    );

    if (rescueResult.rowCount > 0) {
      console.log('Rescue details stored successfully:', rescueResult.rows[0]);
      res.status(200).send('Rescue details stored successfully.');
    } else {
      console.error('Failed to store rescue details:', rescueResult);
      res.status(401).json({ error: 'Sorry, unable to store rescue details' });
    }
  } catch (error) {
    console.error('Error storing rescue details:', error);
    res.status(500).send('Internal server error');
  }
});


app.post('/admin/add-adoption', upload.single('image'), async (req, res) => {
  try {
    const { username, dogName, location, description, dog_age, gender, price } = req.body;

    // Generate URL for the image file
    const dog_image = req.file ? `/images/${req.file.filename}` : '';
    console.log(dog_image)
    // Insert adoption details into the database
    const query = `
          INSERT INTO adoptions (username, dog_name, location, dog_image, description, dog_age, gender, price)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
          RETURNING *;
      `;

    const values = [username, dogName, location, dog_image, description, dog_age, gender, price];
    const result = await pool.query(query, values);

    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('Error adding adoption:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});


app.put('/admin/edit-adoption/:adoptionId', async (req, res) => {
  try {
    const adoptionId = req.params.adoptionId;
    const { username, dogName, location, description, age, gender,  price } = req.body;

    // Validate adoptionId to prevent SQL injection
    if (!adoptionId.match(/^\d+$/)) {
      return res.status(400).json({ success: false, error: 'Invalid adoption ID' });
    }
    const dog_image = req.file ? `/images/${req.file.filename}` : '';
    // Update adoption details in the database
    const query = `
      UPDATE adoptions
      SET username = $1, dog_name = $2, location = $3, description = $4, dog_age = $5, gender = $6, price = $7, dog_image = $8
      WHERE id = $9
      RETURNING *;
    `;

    const values = [username, dogName, location, description, age, gender, price, dog_image, adoptionId];
    const result = await pool.query(query, values);
    console.log(result)

    if (result.rows.length === 0) {
      // Adoption with the provided ID doesn't exist
      return res.status(404).json({ success: false, error: 'Adoption not found' });
    }

    // Return updated adoption details
    res.status(200).json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('Error editing adoption:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

app.delete('/admin/delete-adoption/:adoptionId', async (req, res) => {
  try {
    const adoptionId = req.params.adoptionId;

    // Delete adoption details from the database
    const query = `
        DELETE FROM adoptions
        WHERE id = $1;
    `;

    await pool.query(query, [adoptionId]);

    res.status(200).json({ success: true, message: 'Adoption deleted successfully' });
  } catch (error) {
    console.error('Error deleting adoption:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

app.get('/admin/view-adoptions', async (req, res) => {
  try {
    // Retrieve all adoption details from the database
    const query = `
          SELECT * FROM adoptions;
      `;

    const result = await pool.query(query);

    res.status(200).json({ success: true, data: result.rows });
  } catch (error) {
    console.error('Error fetching adoptions:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});



// Endpoint to retrieve adoption details for a specific user
app.get('/adoption', async (req, res) => {
  const { username } = req.query;

  try {
    // Query the adoptions table for adoptions with the specified username
    const query = 'SELECT * FROM adoptions WHERE username = $1';
    const { rows } = await pool.query(query, [username]);

    res.json(rows);
  } catch (error) {
    console.error('Error fetching adoptions:', error);
    res.status(500).json({ error: 'Failed to fetch adoptions' });
  }
});

app.post('/transactions', (req, res) => {
  try {
    const transactionDetails = req.body;
    // Process the transaction details (e.g., store in database, update user account, send confirmation email, etc.)
    console.log('Received transaction details:', transactionDetails);
    res.sendStatus(200); // Respond with success status
  } catch (error) {
    console.error('Error handling transaction details:', error);
    res.status(500).json({ error: 'Internal server error' }); // Respond with error status
  }
});

//endpoints for admin

app.get('/total-users', async (req, res) => {
  try {
    const client = await pool.connect();
    const result = await client.query('SELECT COUNT(*) AS total_users FROM users');
    const totalUsers = result.rows[0].total_users;
    client.release();
    res.json({ totalUsers });
    console.log(totalUsers)
  } catch (err) {
    console.error('Error fetching total users', err);
    res.status(500).json({ error: 'Error fetching total users' });
  }
});

app.get('/total-dogs-in-rescue', async (req, res) => {
  try {
    const client = await pool.connect();
    const result = await client.query('SELECT COUNT(*) AS total_dogs_in_rescue FROM rescue_requests');
    const totalDogsInRescue = result.rows[0].total_dogs_in_rescue;
    client.release();
    res.json({ totalDogsInRescue });
  } catch (err) {
    console.error('Error fetching total dogs in rescue', err);
    res.status(500).json({ error: 'Error fetching total dogs in rescue' });
  }
});

// API endpoint to get total number of adopted dogs
app.get('/total-adopted-dogs', async (req, res) => {
  try {
    const client = await pool.connect();
    const result = await client.query('SELECT COUNT(*) AS total_adopted_dogs FROM adoptions');
    const totalAdoptedDogs = result.rows[0].total_adopted_dogs;
    client.release();
    res.json({ totalAdoptedDogs });
  } catch (err) {
    console.error('Error fetching total adopted dogs', err);
    res.status(500).json({ error: 'Error fetching total adopted dogs' });
  }
});

app.get('/total-income', async (req, res) => {
  try {
    const client = await pool.connect();
    const result = await client.query('SELECT SUM(paid_price) AS total_income FROM adoptions');
    const totalIncome = result.rows[0].total_income;
    client.release();
    res.json({ totalIncome });
  } catch (err) {
    console.error('Error fetching total income', err);
    res.status(500).json({ error: 'Error fetching total income' });
  }
});
app.get('/check', async (req, res) => {
  res.send('Hiii');
});
// Route to fetch reports data
app.get('/adoption-reports', async (req, res) => {
  try {
    const client = await pool.connect();
    const adoptionReportsQuery = `
      SELECT a.dog_name, a.dog_age, a.gender, a.price, u.username
      FROM adoptions a
      INNER JOIN users u ON a.username = u.username
      `;
    const adoptionReportsResult = await pool.query(adoptionReportsQuery);
    // prepare adoption reports data with user details
    const adoptionReports = adoptionReportsResult.rows.map(row => ({
      dog_name: row.dog_name,
      dog_age: row.dog_age,
      gender: row.gender,
      price: row.price,
      username: row.username
    }));
    //fetch email and phone number for each user

    for (const report of adoptionReports) {
      const userDetailsQuery = `SELECT email,phone_number FROM users WHERE username=$1`;
      const userDetailsResult = await pool.query(userDetailsQuery, [report.username]);
      const userDetails = userDetailsResult.rows[0];
      report.email = userDetails.email;
      report.phone_number = userDetails.phone_number
    }
    res.send({ adoptionReports })


  } catch (error) {
    console.error('Error fetching reports data:', error);
    res.status(500).json({ error: 'Error fetching adoption reports data' });
  }
});

app.get('/rescue-reports', async (req, res) => {
  try {
    const client = await pool.connect();
    const rescueReportsQuery = `SELECT r.name, r.age, r.gender, r.description, r.location, u.username
      FROM rescue_requests r
      INNER JOIN users u ON r.username = u.username
      ` ;

    const resuceReportsResult = await pool.query(rescueReportsQuery);
    const rescueReports = resuceReportsResult.rows.map(row => ({
      name: row.name,
      age: row.age,
      gender: row.gender,
      location: row.location,
      description: row.description,
      username: row.username
    }))

    for (const report of rescueReports) {
      const userDetailsQuery = `SELECT email, phone_number FROM users WHERE username=$1`;
      const userDetailsResult = await pool.query(userDetailsQuery, [report.username]);
      const userDetails = userDetailsResult.rows[0];
      report.email = userDetails.email;
      report.phone_number = userDetails.phone_number

    }
    res.send({ rescueReports })
  } catch (error) {
    console.error('Error fetching  rescue reports data:', error);
    res.status(500).json({ error: 'Error fetching rescue reports data' });
  }

})



// Start the server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
