const puppeteer = require("puppeteer");
const cheerio = require("cheerio");
const fetch = require("node-fetch");
const fs = require("fs");
const path = require("path");
const { v4: uuidv4 } = require("uuid");
const { suitableJsonOutput, writeExcel } = require('./utils')
const omitEmpty = require('omit-empty');
const pgp = require("pg-promise")();
const db = pgp("postgres://mehdi:mehdi@78.46.124.237:5433/mehdi");  //mehdi
const delay = (ms) => new Promise((res) => setTimeout(res, ms));
// const cron = require('node-cron');
// const CronJob = require('cron').CronJob;
const os = require('os');
// var osUtils = require('os-utils');


// ============================================ checkMemoryUsage and getCpuUsagePercentage
function checkMemoryUsage() {
    const totalMemory = os.totalmem();
    const usedMemory = os.totalmem() - os.freemem();
    const memoryUsagePercent = (usedMemory / totalMemory) * 100;
     return memoryUsagePercent;
}

function getCpuUsagePercentage() {
     const cpus = os.cpus();
     let totalIdle = 0;
     let totalTick = 0;

     cpus.forEach(cpu => {
          for (let type in cpu.times) {
               totalTick += cpu.times[type];
          }
          totalIdle += cpu.times.idle;
     });

     return ((1 - totalIdle / totalTick) * 100); 
}


// ============================================ writeExcel
async function writeExcel2() {
     // WriteExcel
     let products = require(PRODUCTS_DB_DIR);
     let suitableProducts = suitableJsonOutput(products);
     writeExcel(suitableProducts, PRODUCTS_EXCEL_DIR)
}


// ============================================ DB
async function removeUrl() {
     const existsQuery = `
        SELECT * FROM unvisited u 
        limit 1
    `
     const deleteQuery = `
          DELETE FROM unvisited 
          WHERE id=$1
     `
     try {
          const urlRow = await db.oneOrNone(existsQuery);
          if (urlRow) {
               await db.query(deleteQuery, [urlRow.id])
          }
          return urlRow;
     } catch (error) {
          console.log("we have no url", error);
     }
}

async function insertProduct(queryValues) {
     const query = `
          insert into products ("url", "xpath", "specifications", "description", "price", "unitofmeasurement", "category", "brand", "sku", "name", "row")
          values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
     `;

     try {
          const result = await db.oneOrNone(query, queryValues);
          return result;
     } catch (error) {
          console.log("Error in insertProduct :", error.message);
     }
}

async function insertUrlToProblem(url) {
    const existsQuery = `
        SELECT * FROM problem u 
        where "url"=$1
    `

    const insertQuery = `
        INSERT INTO problem ("url")
        VALUES ($1)
        RETURNING *;
    `
    const urlInDb = await db.oneOrNone(existsQuery, [url])
    if (!urlInDb) {
        try {
            const result = await db.query(insertQuery, [url]);
            return result;
        } catch (error) {
            console.log(`Error in insertUrlToProblem  function : ${url}\nError:`, error.message);
        }
    }
}

async function insertUrlToVisited(url) {
    const existsQuery = `
        SELECT * FROM visited u 
        where "url"=$1
    `

    const insertQuery = `
        INSERT INTO visited ("url")
        VALUES ($1)
        RETURNING *;
    `
    const urlInDb = await db.oneOrNone(existsQuery, [url])
    if (!urlInDb) {
        try {
            const result = await db.query(insertQuery, [url]);
            return result;
        } catch (error) {
            console.log(`Error in insertUrlToVisited function : ${url}\nError:`, error.message);
        }
    }
}


// ============================================ scrapSingleProduct
async function scrapSingleProduct(page, productURL, imagesDIR, documentsDir, rowNumber=1) {
     try {

          console.log(`======================== Start scraping : \n${productURL}\n`);
          await page.goto(productURL, { timeout:180000 });
  

          await delay(5000);

          const html = await page.content();
          const $ = await cheerio.load(html);
     
          const data = {};
          data["title"] = $('h1.product-title').length ? $('h1.product-title').text().trim() : "";
          data["category"] = $('.breadcrumbs > span > a:last-child').length
               ? $('.breadcrumbs > span > a:last-child')
                    .map((i, a) => $(a).text()?.replace('دسته:', '')?.trim()).get().join(" > ")
               : "";
          
          data["brand"] = 'فانوس دیزاین'


          data['unitOfMeasurement'] = 'عدد'
          data["price"] = "";
          data["xpath"] = "";
     
          const offPercent = $('div > div.product-main > div > div.product-info.summary.col-fit.col.entry-summary.product-summary > div.price-wrapper > p > del > span > bdi ').text()?.trim();
          if (offPercent) {
               data["price"] = $('div > div.product-main > div > div.product-info.summary.col-fit.col.entry-summary.product-summary > div.price-wrapper > p > ins > span').text().replace(/[^\u06F0-\u06F90-9]/g, "")
               data["xpath"] = "/html/body/div[1]/main/div/div[2]/div/div[1]/div/div[2]/div[2]/p/ins/span/bdi/text()";
          }
          
          else {
               data["price"] = $('div > div.product-main > div > div.product-info.summary.col-fit.col.entry-summary.product-summary.tc-init > div.price-wrapper > p > span > bdi').first().text().replace(/[^\u06F0-\u06F90-9]/g, "")
               data["xpath"] = '/html/body/div[1]/main/div/div[2]/div/div[1]/div/div[2]/div[2]/p/span[1]/bdi/text()';
          }
     
          // specification, specificationString
          let specification = {};
          const rowElements =  $('.woocommerce-product-attributes.shop_attributes > tbody tr')

          for (let i = 0; i < rowElements.length; i++) {
               const row = rowElements[i];
     
               const key = $(row).find('th')?.text().trim();
               const value = $(row).find('td')?.text().trim();
     
               specification[key] = value;
          }
          specification = omitEmpty(specification);
          const specificationString = Object.keys(specification).map((key) => `${key} : ${specification[key]}`).join("\n");
     
          // descriptionString
          const descriptionString = $('notFound')
               .map((i, e) => $(e).text()?.trim())
               .get()
               .join('/n');
          
          // Generate uuidv4
          const uuid = uuidv4().replace(/-/g, "");
     
     
          // Download Images
          let imagesUrls = $('.wp-post-image.skip-lazy').map((i, img) => $(img).attr("src").replace(/(-[0-9]+x[0-9]+)/g, "")).get();
          imagesUrls = Array.from(new Set(imagesUrls))
          for (let i = 0; i < imagesUrls.length; i++) {
               try {
                    const imageUrl = imagesUrls[i];
                    const response = await fetch(imageUrl);
     
                    if (response.ok) {
                         const buffer = await response.buffer();
                         const imageType = path.extname(imageUrl);
                         const localFileName = `${uuid}-${i + 1}${imageType}`;
                         const imageDir = path.normalize(
                              imagesDIR + "/" + localFileName
                         );
                         fs.writeFileSync(imageDir, buffer);
                    }
               } catch (error) {
                    console.log("Error In Download Images", error);
               }
          }
     
     
          // download pdfs
          let pdfUrls = $('NotFound').map((i, e) => $(e).attr('href')).get().filter(href => href.includes('pdf'))
          pdfUrls = Array.from(new Set(pdfUrls))
          for (let i = 0; i < pdfUrls.length; i++) {
               try {
                    const pdfUrl = imagesUrls[i];
                    const response = await fetch(pdfUrl);
                    if (response.ok) {
                         const buffer = await response.buffer();
                         const localFileName = `${uuid}-${i + 1}.pdf`;
                         const documentDir = path.normalize(documentsDir + "/" + localFileName);
                         fs.writeFileSync(documentDir, buffer);
                    }
               } catch (error) {
                    console.log("Error In Download Documents", error);
               }
          }
     
     
          // Returning Tehe Required Data For Excel
          const productExcelDataObject = {
               URL: productURL,
               xpath: data["xpath"],
               specifications: specificationString,
               description: descriptionString,
               price: data["price"],
               unitOfMeasurement: data['unitOfMeasurement'],
               category: data["category"],
               brand: data["brand"],
               SKU: uuid,
               name: data["title"],
               row: rowNumber
          };
     
          return productExcelDataObject;
     } catch (error) {
          console.log("Error In scrapSingleProduct in page.goto", error);
          await insertUrlToProblem(productURL);
          return null;
     }

}


// ============================================ Main
async function main() {
     let urlRow;
     let browser;
     let page;
     try {
          const DATA_DIR = path.normalize(__dirname + "/fanosDesign");
          const IMAGES_DIR = path.normalize(DATA_DIR + "/images");
          const DOCUMENTS_DIR = path.normalize(DATA_DIR + "/documents");


          // Create SteelAlborz Directory If Not Exists
          if (!fs.existsSync(DATA_DIR)) { fs.mkdirSync(DATA_DIR); }
          if (!fs.existsSync(DOCUMENTS_DIR)) { fs.mkdirSync(DOCUMENTS_DIR); }
          if (!fs.existsSync(IMAGES_DIR)) { fs.mkdirSync(IMAGES_DIR); }

          // Lunch Browser
          browser = await puppeteer.launch({
               headless: true, // Set to true for headless mode, false for non-headless
               executablePath:
                    process.env.NODE_ENV === "production"
                         ? process.env.PUPPETEER_EXECUTABLE_PATH
                         : puppeteer.executablePath(),
               args: ["--no-sandbox", "--disable-setuid-sandbox"],
               protocolTimeout: 6000000
          });


          page = await browser.newPage();
          await page.setViewport({
               width: 1920,
               height: 1080,
          });

         
          urlRow = await removeUrl();
          if (urlRow?.url) {
               const productInfo = await scrapSingleProduct(page, urlRow.url, IMAGES_DIR, DOCUMENTS_DIR);
               const insertQueryInput = [
                    productInfo.URL,
                    productInfo.xpath,
                    productInfo.specifications,
                    productInfo.description,
                    productInfo.price,
                    productInfo.unitOfMeasurement,
                    productInfo.category,
                    productInfo.brand,
                    productInfo.SKU,
                    productInfo.name,
                    productInfo.row
               ];

               // if exists productInfo insert it to products
               if (productInfo) {
                    await insertProduct(insertQueryInput);
                    await insertUrlToVisited(urlRow?.url);
               }

          }

     }
     catch (error) {
          console.log("Error In main Function", error);
          await insertUrlToProblem(urlRow?.url);
     }
     finally {
          // Close page and browser
          console.log("End");
          await page.close();
          await browser.close();
          await delay(1000);
     }
}


// ============================================ Job

// stopTime = 8000
// let job = new CronJob('*/3 * * * * *', async () => {
     
//      console.log("cron");
//      let usageMemory = (os.totalmem() - os.freemem()) / (1024 * 1024 * 1024); 
//      let memoryUsagePercentage = checkMemoryUsage();
//      let cpuUsagePercentage = await getCpuUsagePercentage();
 

//      if (usageMemory >= 13 || cpuUsagePercentage >= 90) {
//           console.log("=========================================");
//           console.log(`job stopped for ${stopTime} ms`);
//           job.stop();

//           setInterval(() => {
//                console.log(`Restarting cron job after ${stopTime} ms...`)
//                job.start();
//           }, stopTime)
//      } 


//      if (memoryUsagePercentage <= 80 && cpuUsagePercentage <= 85) {
//           main();
//           console.log("main");
//      }

// })

// job.start()

let usageMemory = (os.totalmem() - os.freemem()) / (1024 * 1024 * 1024); 
let memoryUsagePercentage = checkMemoryUsage();
let cpuUsagePercentage = getCpuUsagePercentage();

if (memoryUsagePercentage <= 85 && cpuUsagePercentage <= 80 && usageMemory <= 28) {
     main();
}
else {
     const status = `status:\n
     memory usage = ${usageMemory}
     percentage of memory usage = ${memoryUsagePercentage}
     percentage of cpu usage = ${cpuUsagePercentage}
     \n
     `
     console.log("main function does not run.\n");
     console.log(status);
}





