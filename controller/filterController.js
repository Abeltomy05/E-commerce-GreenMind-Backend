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
            const categoryDoc = await Category.findOne({ 
                name: category, 
                isActive: true 
            });
            if (categoryDoc) {
                query.category = categoryDoc._id;
            }
        }

        if (type) {
            query.type = type;
        }
      
        let pipeline = [
            { $match: query },
            // Lookup category details
            {
                $lookup: {
                    from: 'categories',
                    localField: 'category',
                    foreignField: '_id',
                    as: 'categoryInfo'
                }
            },
            { $unwind: '$categoryInfo' },
            // Only include products with active categories
            { $match: { 'categoryInfo.isActive': true } }
        ];

        if (priceSort || nameSort) {
            let sortStage = {};
            
            if (priceSort) {
                // Add a field for minimum price from variants for sorting
                pipeline.push({
                    $addFields: {
                        minPrice: { $min: '$variants.price' }
                    }
                });
                sortStage.minPrice = priceSort === 'lowToHigh' ? 1 : -1;
            }
            
            if (nameSort) {
                sortStage.name = nameSort === 'aToZ' ? 1 : -1;
            }

            // Add the sort stage to the pipeline
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
                categoryName: '$categoryInfo.name'
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