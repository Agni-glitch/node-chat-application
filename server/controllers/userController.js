const router = require("express").Router();
const User = require("../model/user");
const authMiddleware = require("../middlewares/authmiddleware");
const cloudinary = require("./../cloudinary");
router.get("/get-logged-user", authMiddleware, async (req, res) => {
  try {
    const user = await User.findOne({ _id: req.userId });
    res.send({
      message: "user fetched successfully",
      success: true,
      data: user,
    });
  } catch (err) {
    res.status(400).send({
      message: err.message,
      success: false,
    });
  }
});
router.get("/get-all-user", authMiddleware, async (req, res) => {
  try {
    const allUsers = await User.find({ _id: { $ne: req.userId } });
    res.send({
      message: "all users fetched successfully",
      success: true,
      data: allUsers,
    });
  } catch (err) {
    res.status(400).send({
      message: err.message,
      success: false,
    });
  }
});
router.post("/upload-profile-pic",authMiddleware,async(req,res)=>{
  try {
    const image = req.body.image;
    //upload the image to cloudinary
    const uploadedImage = await cloudinary.uploader.upload(image,
      {
        folder:'chat-app'
      }
    )
    //upload the uesr model and set the profile pic property
    const user = await User.findByIdAndUpdate(
      req.userId,
      {profilePic:uploadedImage.secure_url},
      {new: true}
    )
    res.send({
      message:'Profile pic updated successfully',
      success:true,
      data:user
    })
  } catch (error) {
    res.send({
      message: error.message,
      success: false
    })
  }
})
module.exports = router;
