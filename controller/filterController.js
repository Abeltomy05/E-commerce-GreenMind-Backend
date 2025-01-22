const mongoose = require('mongoose');
const express =require("express")
const Product = require("../model/productModel")
const Category = require("../model/categoryModel")
const User = require('../model/userModel')
const Cart = require('../model/cartModel')
const Offer = require('../model/offerModel')

const getCategoryName = async(req,res)=>{
    try{
        const categories = await Category.find({isActive:"true"}, 'name');
        res.json({ success: true, data: categories });
    }catch(error){
        res.status(500).json({ success: false, message: 'Error fetching categories' });
    }
}

const productTypes = async(req,res)=>{
    try{
        const types = await Product.distinct('type');
        res.json({ success: true, data: types });
    }catch(error){
        res.status(500).json({ success: false, message: 'Error fetching product types' });

    }
}

const productFilter = async(req,res)=>{
    try {
        const { category, type, priceSort, nameSort } = req.query;
        const currentDate = new Date();

        let query = { isDeleted: false };

        // Handle category filter
        if (category) {
            const categoryNames = category.split(',');
            const categoryDocs = await Category.find({ 
                name: { $in: categoryNames }, 
                isActive: true 
            });
            if (categoryDocs.length > 0) {
                query.category = { $in: categoryDocs.map(doc => doc._id) };
            }
        }

        // Handle type filter
        if (type) {
            const types = type.split(',');
            query.type = { $in: types };
        }
      
        let pipeline = [
            { $match: query },
            // Lookup category
            {
                $lookup: {
                    from: 'categories',
                    localField: 'category',
                    foreignField: '_id',
                    as: 'category'
                }
            },
            { $unwind: '$category' },
            // Only include products with active categories
            { $match: { 'category.isActive': true } },
            // Lookup current offer
            {
                $lookup: {
                    from: 'offers',
                    localField: 'currentOffer',
                    foreignField: '_id',
                    as: 'offer'
                }
            },
            { $unwind: { path: '$offer', preserveNullAndEmptyArrays: true } }
        ];

        if (priceSort) {
            // Calculate minimum price considering offers
            pipeline.push({
                $addFields: {
                    minRegularPrice: { 
                        $min: {
                            $map: {
                                input: '$variants',
                                as: 'variant',
                                in: '$$variant.price'
                            }
                        }
                    },
                    hasValidOffer: {
                        $and: [
                            { $ifNull: ['$offer', false] },
                            { $lt: ['$offer.startDate', currentDate] },
                            { $gt: ['$offer.endDate', currentDate] }
                        ]
                    }
                }
            });

            // Calculate discounted price based on offer type
            pipeline.push({
                $addFields: {
                    minEffectivePrice: {
                        $cond: {
                            if: '$hasValidOffer',
                            then: {
                                $let: {
                                    vars: {
                                        discountedPrice: {
                                            $cond: {
                                                if: { $eq: ['$offer.discountType', 'PERCENTAGE'] },
                                                then: {
                                                    $multiply: [
                                                        '$minRegularPrice',
                                                        { $subtract: [1, { $divide: ['$offer.discountValue', 100] }] }
                                                    ]
                                                },
                                                else: { $subtract: ['$minRegularPrice', '$offer.discountValue'] }
                                            }
                                        }
                                    },
                                    in: {
                                        $cond: {
                                            if: { $and: [
                                                { $ifNull: ['$offer.maxDiscountAmount', false] },
                                                { $gt: [{ $subtract: ['$minRegularPrice', '$$discountedPrice'] }, '$offer.maxDiscountAmount'] }
                                            ]},
                                            then: { $subtract: ['$minRegularPrice', '$offer.maxDiscountAmount'] },
                                            else: '$$discountedPrice'
                                        }
                                    }
                                }
                            },
                            else: '$minRegularPrice'
                        }
                    }
                }
            });

            // Sort by effective price
            pipeline.push({
                $sort: {
                    minEffectivePrice: priceSort === 'lowToHigh' ? 1 : -1
                }
            });
        }

        // Handle name sort
        if (nameSort) {
            pipeline.push({
                $sort: {
                    name: nameSort === 'aToZ' ? 1 : -1
                }
            });
        }

        // Project final fields
        pipeline.push({
            $project: {
                _id: 1,
                name: 1,
                type: 1,
                brand: 1,
                images: 1,
                description: 1,
                variants: 1,
                category: 1,
                currentOffer: 1,
                offer: 1,
                minEffectivePrice: 1
            }
        });

        const products = await Product.aggregate(pipeline);

        return res.status(200).json({
            success: true,
            count: products.length,
            data: products
        });

    } catch(error) {
        console.error('Error in filterProducts:', error);
        return res.status(500).json({
            success: false,
            message: 'Error fetching products',
            error: error.message
        });
    }
}

module.exports={
    getCategoryName,
    productTypes,
    productFilter
}