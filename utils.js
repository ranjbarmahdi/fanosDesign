const reader = require('xlsx');

//============================================ scroll to end
async function scrollToEnd(page) {
    await page.evaluate(async () => {
    await new Promise((resolve) => {
        let totalHeight = 0;
        const distance = 50;
        const maxScrolls = 9999999; // You can adjust the number of scrolls

        const scrollInterval = setInterval(() => {
        const scrollHeight = document.body.scrollHeight;
        window.scrollBy(0, distance);
        totalHeight += distance;

        // Stop scrolling after reaching the bottom or a certain limit
        if (totalHeight >= scrollHeight || totalHeight >= distance * maxScrolls) {
            clearInterval(scrollInterval);
            resolve();
        }
        }, 250); // You can adjust the scroll interval
    });
    });
}


function writeExcel(jsonFile, excelDir) {
    let workBook = reader.utils.book_new();
    const workSheet = reader.utils.json_to_sheet(jsonFile);
    reader.utils.book_append_sheet(workBook, workSheet, `response`);
    reader.writeFile(workBook, excelDir);
}

function suitableJsonOutput(oldJson){
    const suitableOutput = oldJson.map((item, index) => {
        const productExcelDataObject = {
            URL: item.URL,
            xpath: item.xpath,
            'خصوصیات / ویژگی‌ها': item.specifications,
            'توضیحات': item.description,
            'قیمت (تومان)': item.price ,
            'واحد اندازه‌گیری': 'عدد' ,
            'دسته‌بندی': item.category ,
            'برند': item.brand ,
            SKU: item.SKU,
            name: item.name ,
            'ردیف': index + 1 
        };
        if (!productExcelDataObject['قیمت (تومان)'] && !productExcelDataObject['offPrice']) {
            productExcelDataObject['xpath'] = '';
        }
        return productExcelDataObject;
    })
    return suitableOutput;
}

module.exports = {
    writeExcel,
    suitableJsonOutput,
    scrollToEnd
}



