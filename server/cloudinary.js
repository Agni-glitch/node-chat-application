const cloudinary = require('cloudinary').v2;
cloudinary.config({ 
        cloud_name: 'dfve1a4vj', 
        api_key: '524124831138547', 
        api_secret: '2K3Y3v1JOQW4QmldCw8V04KHq00'
    });

module.exports = cloudinary;