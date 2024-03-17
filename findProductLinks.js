const puppeteer = require("puppeteer");
const cheerio = require("cheerio");
const fs = require("fs");
const path = require("path");
const { v4: uuidv4 } = require("uuid");
const pgp = require("pg-promise")();
const db = pgp("postgres://mehdi:mehdi@78.46.124.237:5433/mehdi");  //mehdi
const { suitableJsonOutput, writeExcel, scrollToEnd } = require('./utils')
const delay = (ms) => new Promise((res) => setTimeout(res, ms));

async function insertUrl(url) {
    const existsQuery = `
        SELECT * FROM unvisited u 
        where "url"=$1
    `

    const insertQuery = `
        INSERT INTO unvisited ("url")
        VALUES ($1)
        RETURNING *;
    `
    const urlInDb = await db.oneOrNone(existsQuery, [url])
    if (!urlInDb) {
        try {
            const result = await db.query(insertQuery, [url]);
            return result;
        } catch (error) {
            console.log(`Error in insert url function : ${url}\nError:`, error.message);
        }
    }
}

function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}


// ============================================ login
// async function login(page, url ,userOrPhone, pass) {
//      try {
//           await page.goto(url, { timeout: 360000 });

//           let u = "09376993135";
//           let p = "hd6730mrm";
//           // sleep 5 second
//           console.log("-------sleep 5 second");
//           await delay(5000);

//           // load cheerio
//           const html = await page.content();
//           const $ = cheerio.load(html);

//           const usernameInputElem = await page.$$('input#username');
//           await page.evaluate((e) => e.value = "09376993135" ,usernameInputElem[0]);
//           await delay(3000);

//           const continueElem = await page.$$('.register_page__inner > button[type=submit]');
//           await continueElem[0].click();
//           await delay(3000);

//           const passwordInputElem = await page.$$('input#myPassword');
//           await passwordInputElem[0].type("hd6730mrm");
//           // await page.evaluate((e) => e.value = "hd6730mrm" ,passwordInputElem[0]);
//           await delay(3000);

//           const enterElem = await page.$$('.register_page__inner > button[type=submit]');
//           await enterElem[0].click();
//           await delay(3000);
          
//      } catch (error) {
//           console.log("Error In login function", error);
//      }
// }


// ============================================ findAllMainLinks
async function findAllMainLinks(page, initialUrl) {
     const allMainLinks = [];
     try {
          const url = initialUrl;
          await page.goto(url, { timeout: 3600000 });


          // sleep 5 second 
          console.log("-------sleep 5 second");
          await delay(5000);

          // load cheerio
          const html = await page.content();
          const $ = cheerio.load(html);

          // Getting All Main Urls In This Page
          const mainLinks = $('.ux-nav-vertical-menu > li:gt(0)').map((i, li) => {
            const ul = $(li).find('>ul');
            if(ul.length){
                const urls = $(ul).find('>li>a').map((i, e) =>  $(e).attr('href')).get()
                return urls;
            }
            else{
                const urls = $(li).find('>a').map((i, e) => $(e).attr('href')).get();
                return urls;
            }
        }).get()


          // Push This Page Products Urls To allProductsLinks
         allMainLinks.push(...mainLinks);
         
        //   allMainLinks.push(initialUrl);

     } catch (error) {
          console.log("Error In findAllMainLinks function", error.message);
     }

     return Array.from(new Set(allMainLinks));
}


// ============================================ findAllPagesLinks
async function findAllPagesLinks(page, mainLinks) {

     let allPagesLinks = []

     // find pagination and pages     
     for (let i = 0; i < mainLinks.length; i++){
          try {
            const url = mainLinks[i];
            await page.goto(url);
    
            await delay(5000);
            const html = await page.content();
            const $ = cheerio.load(html);
            
            // find last page number and preduce other pages urls
            const paginationElement = $('notFound');
            if (paginationElement.length) {
                let lsatPageNumber = $('notFound').text().trim();
                console.log(lsatPageNumber);
                lsatPageNumber = Number(lsatPageNumber);
                for (let j = 0; j <= lsatPageNumber; j++){
                    const newUrl = url + `page/${j}/`
                    allPagesLinks.push(newUrl)
                }
            }
            else {
                allPagesLinks.push(url)
            }
               
          } catch (error) {
               console.log("Error in findAllPagesLinks", error);
          }
     }      

    allPagesLinks = shuffleArray(allPagesLinks)
    return Array.from(new Set(allPagesLinks))
}


// ============================================ findAllProductsLinks
async function findAllProductsLinks(page, allPagesLinks) {

     for (let i = 0; i < allPagesLinks.length; i++){
          try {
               const url = allPagesLinks[i];
               await page.goto(url, { timeout: 1800000, protocolTimeout: 6000000 });

               // sleep 5 second when switching between pages
               console.log("-------sleep 5 second");
               await delay(5000);

              // Scroll to End
              await scrollToEnd(page);
              await delay(5000);

              let nextPageBtn;
              let c = 0;
              do {
                c++;
                console.log(c);
                const html = await page.content();
                const $ = cheerio.load(html);

                // Getting All Products Urls In This Page
                const productsUrls = $('.products > div > div > .product-small > .box-image > .image-fade_in_back > a')
                        .map((i, e) => $(e).attr('href'))
                        .get()
                        
                console.log(productsUrls.length);
                  
                for (let j = 0; j < productsUrls.length; j++){
                    try {
                        const url = productsUrls[j];
                        await insertUrl(url);
                        await delay(500);
                    } catch (error) {
                        console.log("Error in findAllProductsLinks for loop:", error.message);
                    }
                }

                    
                // nextPageBtn = await page.$$('#pagination_bottom > ul > li.pagination_next > a');
                nextPageBtn = await page.$$('notFound');
                console.log(nextPageBtn.length);
                if(nextPageBtn.length){
                        let btn = nextPageBtn[0];
                        await btn.click();
                }
                await delay(3000);
               }
               while(nextPageBtn.length)
          } catch (error) {
               console.log("Error In findAllProductsLinks function", error);
          }
     }
}


// ============================================ Main
async function main() {
    try {
        const INITIAL_PAGE_URL = `https://fanoosdesign.ir/`;

        // Lunch Browser
        const browser = await puppeteer.launch({
            headless: false, // Set to true for headless mode, false for non-headless
            executablePath:
                process.env.NODE_ENV === "production"
                        ? process.env.PUPPETEER_EXECUTABLE_PATH
                        : puppeteer.executablePath(),
            args: ["--no-sandbox", "--disable-setuid-sandbox"],
            protocolTimeout: 6000000
        });

        const page = await browser.newPage();
        await page.setViewport({
            width: 1920,
            height: 1080,
        });
    
        const mainLinks = await findAllMainLinks(page, INITIAL_PAGE_URL);
        await findAllProductsLinks(page, mainLinks);
        
    // Close page and browser
    console.log("End");
    await page.close();
    await browser.close();
    } catch (error) {
        console.log("Error In main Function", error);
    }
}

main();
