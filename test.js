const reader = require('xlsx');

const x = require('./toofanFelez/products.json');
const excelDir = './response.xls'
function writeExcel(jsonFile, excelDir) {
    let workBook = reader.utils.book_new();
    const workSheet = reader.utils.json_to_sheet(jsonFile);
    reader.utils.book_append_sheet(workBook, workSheet, `response`);
    reader.writeFile(workBook, excelDir);
}


writeExcel(x, excelDir)