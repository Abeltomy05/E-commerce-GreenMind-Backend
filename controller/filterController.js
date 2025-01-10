const mongoose = require('mongoose');
const express =require("express")
const Product = require("../model/productModel")
const Category = require("../model/categoryModel")
const User = require('../model/userModel')
const Cart = require('../model/cartModel')

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
     try{
        const { category, type, priceSort, nameSort  } = req.query;

        let query = { isDeleted: false };

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

        if (type) {
            const types = type.split(',');
            query.type = { $in: types };
        }
      
        let pipeline = [
            { $match: query },

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
            { $match: { 'category.isActive': true } }
        ];

        if (priceSort || nameSort) {
            let sortStage = {};
            
            if (priceSort) {
                pipeline.push({
                    $addFields: {
                        minPrice: { 
                            $min: {
                                $map: {
                                    input: '$variants',
                                    as: 'variant',
                                    in: '$$variant.price'
                                }
                            }
                        }
                    }
                });
                sortStage.minPrice = priceSort === 'lowToHigh' ? 1 : -1;
            }
            
            if (nameSort) {
                sortStage.name = nameSort === 'aToZ' ? 1 : -1;
            }

            pipeline.push({ $sort: sortStage });
        }


        

        pipeline.push({
            $project: {
                _id: 1,
                name: 1,
                type: 1,
                brand: 1,
                images: 1,
                description: 1,
                variants: 1,
                category: 1 
            }
        });

        const products = await Product.aggregate(pipeline);

        return res.status(200).json({
            success: true,
            count: products.length,
            data: products
        });


     }catch(error){
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