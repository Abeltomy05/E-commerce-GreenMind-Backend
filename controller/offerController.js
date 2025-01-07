const Offer = require('../model/offerModel') 
const Product = require('../model/productModel')
const Category = require('../model/categoryModel')

const getOffers = async(req,res)=>{
    try{
        const offers = await Offer.find()
            .sort({createdAt: -1});
        if(!offers){
            return res.status(404).json('No offers found')
        }
    
        return res.status(200).json(offers)
    }catch(error){
        console.error('Error fetching offers:', error);
        return res.status(500).json({ 
            message: 'Error fetching offers',
            error: error.message 
        });
    }

}

const createOffer = async(req,res)=>{
        try{
            const {
                name,
                description,
                discountType,
                discountValue,
                startDate,
                endDate,
                applicableTo,
                targetName,
                maxDiscountAmount
              } = req.body;

              if (!name || !discountType || !discountValue || !startDate || !endDate || !applicableTo || !targetName) {
                return res.status(400).json({ message: 'Missing required fields' });
              }

              const startDateObj = new Date(startDate);
              const endDateObj = new Date(endDate);

              if (isNaN(startDateObj.getTime()) || isNaN(endDateObj.getTime())) {
                return res.status(400).json({ message: 'Invalid date format' });
              }

              const now = new Date();
                now.setUTCHours(0, 0, 0, 0);

                if (startDateObj < now) {
                return res.status(400).json({ message: 'Start date cannot be in the past' });
                }

                if (endDateObj <= startDateObj) {
                return res.status(400).json({ message: 'End date must be after start date' });
                }
              let targetModel = applicableTo === 'product' ? Product : Category;
              const target = await targetModel.findOne({ name: targetName });

              if (!target) {
                return res.status(400).json({ message: `${applicableTo} not found` });
              }

              const existingOffer = await Offer.findOne({
                targetId: target._id,
                endDate: { $gt: now }, 
                $or: [
                    {
                        startDate: { $lte: endDateObj },
                        endDate: { $gte: startDateObj }
                    }
                ]
            });
    
            if (existingOffer) {
                return res.status(400).json({
                    message: `An active offer already exists for this ${applicableTo}`,
                    existingOffer: {
                        name: existingOffer.name,
                        startDate: existingOffer.startDate,
                        endDate: existingOffer.endDate,
                        discountType: existingOffer.discountType,
                        discountValue: existingOffer.discountValue
                    }
                });
            }

               if (discountType === 'PERCENTAGE' && (discountValue <= 0 || discountValue > 100)) {
                return res.status(400).json({ message: 'Percentage discount must be between 0 and 100' });
                }

                if (discountType === 'FIXED' && discountValue <= 0) {
                return res.status(400).json({ message: 'Fixed discount must be greater than 0' });
                }


        
             const overlappingOffer = await Offer.findOne({
                    targetId: target._id,
                    $or: [{
                        startDate: { $lte: endDateObj },
                        endDate: { $gte: startDateObj }
                    }]
                    });

              if (overlappingOffer) {
                    return res.status(400).json({ message: 'An offer already exists for this target during the specified date range' });
                    }
                    const offer = new Offer({
                        name,
                        description,
                        discountType,
                        discountValue,
                        startDate: startDateObj,
                        endDate: endDateObj,
                        applicableTo,
                        targetId: target._id,
                        maxDiscountAmount: maxDiscountAmount || null
                      });
                  

              await offer.save();

              if (applicableTo === 'product') {

                await Product.findByIdAndUpdate(target._id, { currentOffer: offer._id });
            } else {
                await Product.updateMany(
                    { 
                        category: target._id,
                        currentOffer: { $exists: false } 
                    },
                    { currentOffer: offer._id }
                );

                await Category.findByIdAndUpdate(target._id, { currentOffer: offer._id });
            }

            const expirationDelay = endDateObj.getTime() - Date.now();
            setTimeout(async () => {
                try {
                    if (applicableTo === 'product') {
                        await Product.findByIdAndUpdate(target._id, { $unset: { currentOffer: 1 } });
                    } else {
                        await Product.updateMany(
                            { 
                                category: target._id,
                                currentOffer: offer._id // Only clear if it's this specific offer
                            },
                            { $unset: { currentOffer: 1 } }
                        );
                        await Category.findByIdAndUpdate(target._id, { $unset: { currentOffer: 1 } });
                    }
                } catch (error) {
                    console.error('Error clearing expired offer:', error);
                }
            }, expirationDelay);

          
              res.status(201).json({ 
                message: 'Offer created successfully',
                offer 
              });

        }catch(error){
            console.error('Error creating offer:', error);
            res.status(500).json({ 
              message: 'Internal server error',
              error: error.message 
            });
        }
}

const deleteOffer = async(req,res)=>{
    try{
    const offerId = req.params.id;

    const offer = await Offer.findById(offerId);
        
    if (!offer) {
        return res.status(404).json({ message: 'Offer not found' });
    }

    if (offer.applicableTo === 'product') {
        await Product.updateOne(
            { _id: offer.targetId },
            { $unset: { currentOffer: 1 } }
        );
    } else {
        await Product.updateMany(
            { 
                category: offer.targetId,
                currentOffer: offerId // Only remove this specific offer
            },
            { $unset: { currentOffer: 1 } }
        );

        await Category.updateOne(
            { _id: offer.targetId },
            { $unset: { currentOffer: 1 } }
        );
    }

    await Offer.findByIdAndDelete(offerId);

    res.status(200).json({ 
        success: true,
        message: 'Offer deleted successfully'
    });
            
} catch (error) {
    console.error('Error deleting offer:', error);
    res.status(500).json({ 
        success: false,
        message: 'Error deleting offer',
        error: error.message 
    });
}
}

const getProducts = async (req, res) => {
    try {
      const products = await Product.find({ isDeleted: false }, 'name');
      res.status(200).json(products);
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  };

  const getCategories = async (req, res) => {
    try {
      const categories = await Category.find({ isActive: true }, 'name');
      res.status(200).json(categories);
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  };

module.exports = {
    getOffers,
    createOffer,
    deleteOffer,
    getProducts,
    getCategories
}