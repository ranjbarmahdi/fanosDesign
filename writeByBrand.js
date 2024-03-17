const fs = require("fs");
const path = require("path");
const pgp = require("pg-promise")();
const { createObjectCsvWriter } = require('csv-writer');
const db = pgp("postgres://mehdi:mehdi@78.46.124.237:5433/mehdi");  //mehdi
const delay = (ms) => new Promise((res) => setTimeout(res, ms));

async function getUniqueBrands() {
    const query = `
        select distinct p."brand"
        from products p
    `

    try {
        const brands = await db.any(query);
        return brands
    } catch (error) {
        console.log("Error in uniqueBrands function :", error.message);
        return [];
    }
}


async function getBrandProducts(brandName) {
    const query = `
        select * 
        from products p
        where p."brand" = $1
    `

    try {
        const products = await db.any(query, [brandName]);
        return products
    } catch (error) {
        console.log("Error in getBrandProducts function :", error.message);
        return [];
    }
}

async function getAllProducts() {
    const query = `
        select * 
        from products p
    `

    try {
        const products = await db.any(query);
        return products
    } catch (error) {
        console.log("Error in getAllProducts function :", error.message);
        return [];
    }
}

async function writeCsv(data, csvPath) {
    try {
        if (!data) {
            throw new Error("data is empty");
        }

        const csvHeaders = Object.keys(data[0]).map(key => ({ id: key, title: key }))

        const csvWriter = createObjectCsvWriter({
            path: csvPath, // Output file path
            header: csvHeaders // Header for the CSV file
        });

        csvWriter.writeRecords(data)
            .then(() => {
                console.log(`CSV ${path.basename(csvPath)} has been written successfully`);
            })
            .catch(err => {
                console.error(`Error writing ${path.basename(csvPath)} CSV:`, err);
            });
        
    } catch (error) {
        console.log("Error in writeCsv function", error.message);
    }
}

async function main() {

    if (!fs.existsSync('./csv')) {
        fs.mkdirSync('./csv')
    }

    // get unique brand names
    let brands = await getUniqueBrands();
    brands = brands.map(row => row.brand);

    
    // for (let i = 0; i < brands.length; i++){
    //     const brandName = brands[i];
    //     console.log("================",i,"==============", brandName);

    //     // get products for each brand
    //     const products = await getBrandProducts(brandName);

    //     // write csv
    //     const csvFilePath = path.join('./csv', `${brandName}.csv`);
    //     await writeCsv(products, csvFilePath)
    // }
    

    // write all products
    const allProducts = await getAllProducts();
    await writeCsv(allProducts, './allProducts.csv')

}

main()