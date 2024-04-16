const express = require('express');
const bodyParser = require('body-parser');
const { Pool } = require('pg');
const cors = require('cors')
const multer = require('multer');
const path = require('path');
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
  user: 'my_db_0vlk_user',
  host: 'dpg-coek6d0l5elc738aie50-a',
  database: 'my_db_0vlk',
  password: 'UKiyi0bKTJNtkXiwy9etgvGJV6L9F72x',
  port: 5432, // Default PostgreSQL port
  ssl: {
    rejectUnauthorized: false // Required for Render PostgreSQL connections
  }
});

//create a nodemailer using smtp transport
const transporter = nodemailer.createTransport({
  host: 'smtp.gmail.com',
  port: 587,
  secure: false,
  auth: {
    user: "vishaladhikari1738@gmail.com",
    pass: 'vmhs nmwl hxbw csbt'
  },
  debug: true

})

const storage = multer.diskStorage({
  destination: function (req,file,cb) {
    cb(null, path.join(__dirname, 'images'))
  },
  filename: function(req,file,cb) {
    const ext = path.extname(file.originalname);
    const filename = uuidv4() + ext;
    cb(null, filename)
  }
})

const upload = multer({storage: storage})

// Signup route
app.post('/api/signup', async (req, res) => {
    try {
      // Retrieve user data from the request body
      const { username, email, password, full_name, phone_number } = req.body;

      //generate otp code
      const otpCode = otpGenerator.generate(4, {digits: true, alphabets:false, upperCase: false, specialChars: false});

  
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
        from: 'vishaladhikari1738@gmail.com',
        to: email ,
        subject: 'OTP Verification',
        text: `Your OTP code is: ${otpCode}`,
      }
      console.log(mailOptions)

      transporter.sendMail(mailOptions, (error, info) => {
        if (error) {
          console.error('Email Error:', error);
        res.status(500).json({ error: 'Failed to send OTP email' });
        }  else {
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


//OTP verification route
app.post('/api/verify-otp', async(req, res) => {
  try {
    const {email,otp} = req.body;
    const client = await pool.connect();
    const query = `SELECT otp_code FROM users WHERE email=$1`;
    const result = await client.query(query, [email]);
    client.release();

    if (result.rows.length === 0) {
      return res.status(404).json({error: 'User not found'})
    }

    const storedOtp = result.rows[0].otp_code;
    if(otp === storedOtp) {
      res.status(200).json({message: "OTP verified successfully"});
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
        res.status(200).json({ message: 'Login successful' });
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
      const { username, name, location, description,age, gender, phoneNumber } = req.body;
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
  
      const values = [username, name, location, image_url, description,age, gender, phoneNumber];
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
    const { rows } = await pool.query('SELECT image_filename, name, gender, location,age FROM rescue_requests');
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

    for(const report of adoptionReports) {
      const userDetailsQuery = `SELECT email,phone_number FROM users WHERE username=$1`;
      const userDetailsResult = await pool.query(userDetailsQuery,[report.username]);
      const userDetails = userDetailsResult.rows[0];
      report.email = userDetails.email;
      report.phone_number = userDetails.phone_number
    }
    res.send({adoptionReports})
    
   
  } catch (error) {
    console.error('Error fetching reports data:', error);
    res.status(500).json({ error: 'Error fetching adoption reports data' });
  }
});

app.get('/rescue-reports', async(req, res) => {
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
     }) )

     for(const report of rescueReports) {
      const userDetailsQuery = `SELECT email, phone_number FROM users WHERE username=$1`;
      const userDetailsResult = await pool.query(userDetailsQuery, [report.username]);
      const userDetails = userDetailsResult.rows[0];
      report.email = userDetails.email;
      report.phone_number = userDetails.phone_number
      
     }
     res.send({rescueReports})
  } catch(error) {
    console.error('Error fetching  rescue reports data:', error);
    res.status(500).json({ error: 'Error fetching rescue reports data' });
  }

})

    
  
// Start the server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
