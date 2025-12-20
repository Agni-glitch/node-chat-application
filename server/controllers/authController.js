const router = require("express").Router();
const bcrypt = require("bcryptjs");
const User = require("../model/user");
const JWT = require("jsonwebtoken");

router.post("/signup", async (req, res) => {
  // res.send('User created successfully');
  try {
    //1.user already exists
    const user = await User.findOne({ email: req.body.email });
    //2.if exist error response
    if (user) {
      return res.send({
        message: "User already exists",
        success: false,
      });
    }
    //3.encrypt password
    const hashedPassword = await bcrypt.hash(req.body.password, 10);
    req.body.password = hashedPassword;
    //4.save to data base
    const newUser = new User(req.body);
    await newUser.save();

    res.status(201).send({
      message: "User created successfully",
      success: true,
    });
  } catch (error) {
    res.send({
      message: error.message,
      success: false,
    });
  }
});
router.post("/login", async (req, res) => {
  // res.send('user logged in successfully')
  try {
    //1.check if user exists
    const { email, password } = req.body;
    if (!email || !password) {
      return res.send({
        message: "Email and password are required",
        success: false,
      });
    }
    const user = await User.findOne({ email }).select("+password");
    if (!user) {
      return res.send({
        message: "User not exists",
        success: false,
      });
    }
    //2.if password is correct
    const isValid = await bcrypt.compare(password, user.password);
    if (!isValid) {
      return res.send({
        message: "invalid password",
        success: false,
      });
    }
    //3. assign to a JWT
    const token = JWT.sign({ userId: user._id }, process.env.SECRET_KEY, {
      expiresIn: "1d",
    });
    res.send({
      message: "user logged in successfully",
      success: true,
      token: token,
    });
  } catch (err) {
    res.send({
      message: err.message,
      success: false,
    });
  }
});
module.exports = router;
