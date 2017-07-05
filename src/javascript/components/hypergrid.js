import React, { Component } from 'react';
import _ from 'underscore';
import moment from 'moment';
import excel from '../vendor/ExcelAPI';
import ticker from '../griddata/data_ticker';
import childWindow from './child-window';

let Excel, lastSelectedRow, _cachedGridSelectionData;
let latestWorkBook = null;

const _arrayGen = ticker.arrayGenerator();

const countries = ['GR','DK','ZA','RU','CO','IT','IN','BR','AE','AF','AG','AI','AM','AO','AS','AR','AT','AU','AX','BA','BB','BD','BE','BF','BH','BI','BJ','BM','BN','BS','BT','BV','BY','CA','CC','CD','CG','CH','CK','CL','CM','CN','CO','CR','CU','CV','CX','CY','CZ','DE','DM','DO','DZ','EE','EH','ES','FI','FJ','FK','FM','FR','GB','GE','GI','GL','GM','GN','GP','GQ','GS','GT','GU','GW','GY','HK','HM','HN','HR','HU','ID','IE','IL','IO','IQ','IR','JO','JP','KE','KG','KH','KM','KY','KZ','LC','LI','LK','LR','LS','LT','LU','LV','LY','MD','MH','MK','MM','MO','MQ','MR','MS','MT','MU','MV','MW','MX','MY','MZ','NA','NC','NE','NF','NG','NI','NL','NO','NP','NR','NU','NZ','OM','PA','PE','PF','PH','PK','PL','PM','PN','PR','PS','PW','PY','QA','RE','RO','RS','SA','SB','SD','SE','SG','SH','SJ','SM','SN','SO','SR','ST','SV','TC','TD','TH','TJ','TK','TL','TN','TO','TR','TT','TV','TW','UM','UY','UZ','VA','VE','VI','VN','WS','ZA','ZW','KR'];
const imageCache = {};

(function() {
  let each, img;
  for (let i = 0; i < countries.length; i++) {
    each = countries[i];
    img = new Image();
    img.src = 'images/famfamfam_flag_icons/png/' + each.toLowerCase() + '.png';
    imageCache[each] = img;
  }
  img = new Image();
  img.src = 'images/up-arrow.png';
  imageCache['up-arrow'] = img;

  img = new Image();
  img.src = 'images/down-arrow.png';
  imageCache['down-arrow'] = img;
})();

const typeAlignmentMap = {
  j: 'right',
  s: 'left',
  t: 'center',
  f: 'right',
  d: 'center'
};

const isInt = function(n){
  return Number(n)===n && n%1===0;
};

const isFloat = function(n){
  return n===Number(n)  && n%1!==0
};

const format = (data) => {
  if (isInt(data)) {
    if (data > 1431446226436) { // this is a time
      return moment(data).format('HH:mm:ss.SSS');
    } else {
      return numeral(data).format('0,0');
    }
  } else if (isFloat(data)) {
      return numeral(data).format('0,0.00');
  } else {
      return data;
  }
};

const excelCallback = (o) => {
  console.log("EXCEL CALLBACK ", o );
  const _hyperBlotters = workbooks.filter(function(d, i){
    return d.name === "hyperblotter.xlsx"
  });

  if(_hyperBlotters.length > 0){
    fin.desktop.InterApplicationBus.publish("inter_app_messaging", {
      hyperblotterExists: true
    });
  }

  switch(o.type){
    case "workbookAdded" :
      console.log("A workbook has been added and the name is ", o.workbook.name);
      latestWorkBook = o.workbook;
    break;
    case "connected" :
      console.log("There has been a connection event .. ", o)
    break;
    default :
      console.log("The default action in the switch statement.")
  }
};

const splitFlatArray = (array, rows) => {
  const _array = array.slice(0)
  let _returnArray = [];
  let _start = 0, _end, _rowLength;
  _rowLength = Math.ceil(_array.length / rows);
  for(let i = 0; i< _array.length; i+=_rowLength){
    _start =  i;
    _end = _start + _rowLength;
    let _temp = _array.slice(_start,_end);
    _returnArray.push(_temp)
    _start = _end +1
  }
  return _returnArray;
};

const createExcelCoordinates = (a, b) => {
  if(isNaN(a) || isNaN(b)) return;
  let _xCoord;
  const _alphabet = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L", "M", "N", "O", "P", "Q", "R", "S", "T", "U", "V", "W", "X", "Y", "Z"]
  const _numberOfAlphabetsLength = Math.floor(a/_alphabet.length);
  if(_numberOfAlphabetsLength > _alphabet.length * _alphabet.length ){
    throw new Error("There are too many columns to generate a coordinate.")
  }
  const _alphabetLength = a % _alphabet.length;
  const _letterOne = _alphabet[_numberOfAlphabetsLength-1] ? _alphabet[_numberOfAlphabetsLength-1] : "";
  const _letterTwo  = _alphabet[_alphabetLength-1];

  _xCoord = _letterOne+_letterTwo;
  return {x: _xCoord, y: b}
};

///////////////////////////////////

class HyperGrid extends Component {
  openBidOffer = () => {
    childWindow.createChildWindow({
      name: 'orders',
      url: 'order.html',
      autoShow: true,
      width: 960,
      maxWidth: 960,
      minWidth: 960,
      height: 594 / 3,
      maxHeight: 594 / 3,
      minHeight: 594 / 3,
      frame: false
    });
  }

  componentDidMount = () => {
    fin.desktop.main(() => {
      document.querySelector('fin-hypergrid-excel').unSubscribeToBus();

      Excel = fin.desktop.Excel;
      Excel.init();
      Excel.getConnectionStatus(excelCallback);
      Excel.addEventListener("workbookAdded", excelCallback);
      Excel.addEventListener("workbookClosed", excelCallback);
      Excel.addEventListener("connected", excelCallback);
      Excel.addEventListener("workbookActivated", function(w){
        console.log("THERE HAS BEEN A WORKBOOK workbookActivated");
      });

      //console.log("Called Excel ", Excel)
      //fin.desktop.InterApplicationBus.subscribe("*", "excelResult", function(data) {
      //    console.log("excelResult ", data);
      //});

      fin.desktop.InterApplicationBus.subscribe("*", "excelEvent", function(data) {
          console.log("excelEvent", data.workbookName);
      });

      //-- function tp split the data returned from the fin-hypergid selection venet into a 3d object
      //function splitFlatArray(array, columns){
      //    var _returnArray = [];
      //
      //    var _numArrays = Math.floor(array.length / columns );
      //    var _arrayLength = array.length / _numArrays
      //
      //    for(var i = 0; i<=array.length; i+= _arrayLength) {
      //        _returnArray.push(array.slice(i, i+(_arrayLength) ));
      //    }
      //    return _returnArray;
      //}

      fin.desktop.InterApplicationBus.subscribe("*", "onSelect", function(data) {
        var clonedDataValues = data.selection[0].values.slice(0);
        var _rowHeight = 1+(data.selection[0].region[2] - data.selection[0].region[0]);
        var _arrData =  splitFlatArray(clonedDataValues, _rowHeight);

        fin.desktop.Excel.getWorkbooks(function(workbooks){
          var _hyperBlotter = workbooks.filter(function(d, i){
            return d.name === "hyperblotter.xlsx"
          });

          console.log("There are ", _hyperBlotter.length , " HyperBlotters");

          _hyperBlotter.map(function(d,i){
            var _worksheet = d.getWorksheets(function(ws){
              ws.filter(function(dd,ii){
                return dd.name === "Sheet1"
              }).map(function(ddd,iii){
                var _coords = createExcelCoordinates(data.selection[0].region[1], data.selection[0].region[0]);

                if(_cachedGridSelectionData){
                  if(_cachedGridSelectionData.x !== _coords.x || _cachedGridSelectionData.y !== _coords.y ){
                    ddd.setCells(_cachedGridSelectionData.data, _cachedGridSelectionData.x + _cachedGridSelectionData.y);
                  }
                }

                var _arrayBlankClone = _arrData.slice(0)
                  .map(function(d,i){
                  return d.map(function(dd,ii){
                    return "";
                  })
                });

                _cachedGridSelectionData = {data: _arrayBlankClone, x: _coords.x , y: _coords.y};
                ddd.setCells(_arrData, _coords.x + _coords.y);
              });
            });
          });
        });

          /*
          if(latestWorkBook){
              latestWorkBook.getWorksheets(function(ws){
                  // console.log("First Worksheet = ", ws[0]);
                  // console.log(data.selection[0].region);

                  var _coords = createExcelCoordinates(data.selection[0].region[1], data.selection[0].region[0]);
                  //if(_cachedGridSelectionData){
                  //    if(_cachedGridSelectionData.x !== _coords.x || _cachedGridSelectionData.y !== _coords.y ){
                  //       ws[0].setCells(_cachedGridSelectionData.data, _cachedGridSelectionData.x + _cachedGridSelectionData.y);
                  //    }
                  //}
                  console.log("_arrData --------------- x : ", data.selection[0].region[1]);
                  console.log("_arrData --------------- y : ", data.selection[0].region[0]);
                  console.log("_arrData --------------- width : ", data.selection[0].region[3]);
                  console.log("_arrData --------------- height : ", data.selection[0].region[2]);
                  //_arrData.map(function(d,i){
                  //    console.log("Row ---- ")
                  //    return d.map(function(dd,ii){
                  //        console.log(ii,"------- ",dd)
                  //    })
                  //})
                  console.log("_arrData = ",_arrData);
                  console.log("_coords.x + _coords.y = ",_coords.x + _coords.y);

                  ws[0].setCells(_arrData, _coords.x + _coords.y);
                  // ws[0].setCells([["test", "test"], ["test", "test"]], _coords.x + _coords.y);

                  //var _arrayClone = _arrData.slice(0);
                  //_arrayClone.map(function(d,i){
                  //    return d.map(function(dd,ii){
                  //        return "";
                  //    })
                  //});
                  //_cachedGridSelectionData = {data: _arrayClone, x: _coords.x , y: _coords.y};
              })
          }
          */
          });
    });

    setTimeout(function(){
      try {
        fin.desktop.Window.getCurrent().bringToFront();
        console.log("Bringing HyperGrid to the front")
      }catch(err){
        console.log("Error with HyperGrid coming to the front ", err)
      }
    }, 1000);

    window.addEventListener('polymer-ready', function(){
      const jsonGrid = document.querySelector('#stock-example');
      const jsonModel = jsonGrid.getBehavior();

      jsonGrid.getRenderer().paint = function(gc) {
        if (!this.grid) {
          return;
        }
        this.renderGrid(gc);
        //draw the thick blue line at the bottom of the header
        gc.beginPath();
        var fixedColumnsWidth = jsonModel.getFixedColumnsWidth();
        var viewWidth = this.getBounds().width() - 200; // look in fin-hypergrid and initializtion of fin-canvas
        var height = this.getFixedRowHeight(0);
        gc.strokeStyle = '#3D77FE';//61,119,254
        gc.lineWidth = 4;
        gc.moveTo(0, height + 0.5);
        gc.lineTo(viewWidth, height + 0.5);
        gc.stroke();
        this.getGrid().gridRenderedNotification();
      };

      jsonGrid.getRenderer().paint.bind(jsonGrid);

      var cellProvider = jsonModel.getCellProvider();
      var __trace = true
      jsonModel.setData(_arrayGen.getStocks());

      if(__trace){
        __trace == false
      }

      jsonModel.setFixedColumnCount(1);
      jsonModel.setHeaders(['Symbol','Name', 'Today', 'Last', 'Change','Volume','Bid Qty']);
      jsonModel.setFields(['TICKER','NAME', 'Today', 'Last', 'Change','Volume','BidQuantity']);

      const bgColor = '#07071E';
      const fixedAreasBGColor = bgColor;

      const font = "24px Roboto Condensed";
      const headingFont = "14px Roboto Condensed";
      const headingFGColor = '#3D77FE';

      const lnfOverrides = {
        font: font,
        topLeftFont: headingFont,
        fixedRowFont: headingFont,
        fixedColumnFont: font,
        backgroundColor2: bgColor,
        backgroundColor: bgColor,
        topLeftBackgroundColor: fixedAreasBGColor,
        fixedColumnBackgroundColor: fixedAreasBGColor,
        fixedRowBackgroundColor: fixedAreasBGColor,
        color: 'white',
        topLeftColor: headingFGColor,
        fixedColumnColor: 'white',
        fixedRowColor: headingFGColor,
        lineColor: '#131C23',
        gridLinesV: false,
        gridLinesH: true,
        fixedColumnFGSelColor: 'white',
        fixedColumnBGSelColor: '#3D77FE',
        fixedRowFGSelColor: 'white',
        fixedRowBGSelColor: '#3D77FE',
        columnAutosizing: false,
        defaultFixedRowHeight: 40
      };

      jsonModel.defaultRowHeight = 57,

      //to apply to a specific table
      jsonGrid.addProperties(lnfOverrides);
      jsonGrid.editAt = function(){};
      jsonGrid.addFinEventListener('fin-click', function(event) {
        setTimeout(function(){
          _arrayGen.setSortArray(jsonGrid.getState().sorted);
        }, 10);
      });

      jsonGrid.addFinEventListener('fin-selection-changed', function(event) {
        setTimeout(function() {
          lastSelectedRow = jsonGrid.getMouseDown().y || 0;
          const row = jsonModel.getRow(lastSelectedRow);

          childWindow.createChildWindow({
            name: row.NAME,
            url: 'row-view.html?row=' + lastSelectedRow,
            autoShow: true,
            width: 350,
            maxWidth: 350,
            frame: false,
            maximizable: false,
            height: 600 / 3,
            maxHeight: 600 / 3,
            minHeight: 600 / 3
          });
        }, 100);
      });

      ticker.timerGenerator().start();
      document.addEventListener("frame-updated", function(e){
        jsonModel.setData(_arrayGen.getDataWithRandomisation(jsonGrid.getVScrollValue(), jsonGrid.getVScrollValue()+11));
        jsonModel.dataModified();
      });

      jsonModel.fixedColumnClicked = (grid, cellData) => {
        lastSelectedRow =  cellData.gridCell.y;
        const row = jsonModel.getRow(lastSelectedRow)
        //childWindow.createChildWindow({
        //    name: row.NAME,
        //    url: 'chartiq/stx-advanced.html?row=' + lastSelectedRow,
        //    autoShow: true,git
        //    defaultWidth: 960,
        //    maxWidth: 960,
        //    minWidth: 960,
        //    maxHeight: 594,
        //    defaultHeight: 594,
        //    minHeight: 594,
        //    resizable:false,
        //    frame: true,
        //    maximizable: false,
        //    saveWindowState: false
        //})
      };

      jsonModel.highlightCellOnHover= function(isColumnHovered, isRowHovered) {
          return isRowHovered;
      };

      const flashMap = {
        red: function(v) {
          return 'rgba(255, 0, 0, '+ (1.0-(40-v)/40) +')';
        },

        green: function(v) {
          return 'rgba(0, 255, 0, '+ (1.0-(40-v)/40) +')';
        }
      };

      cellProvider.getCell = function(config) {
        let renderer = cellProvider.cellCache.simpleCellRenderer;
        config.halign = 'right';
        const x = config.x;
        const y = config.y;
        const row = jsonModel.getRow(y) || {
          flash: 0,
          flashColor: 'green'
        };

        if(x === 0){
          config.halign = 'right';
          config.bgColor = 'red';
        };

        if(x === 1){
          config.halign = 'right';
        };

        if (x === 2) {
          renderer = cellProvider.cellCache.sparklineCellRenderer;
        } else if (x === 4 || x === 6) {
          config.value = format(config.value);
          config.halign = 'center';
          if (config.value.indexOf('-') === 0) {
            config.value = '(' + config.value.substring(1) + ')';
            config.fgColor = 'red';
          } else {
            config.fgColor = 'green';
          }
          //config.font = '24px Verdana';
        } else if (x === 3) {
          config.value = format(config.value);
          if (row.flash > 0) {
            config.bgColor = flashMap[row.flashColor](row.flash);
            config.fgColor = 'white';
            row.flash = row.flash - 1;
          }
        } else if (x === 13) {
          config.value = [imageCache[config.value],config.value,null];
        } else {
          config.value = format(config.value);
        }
        row.lastViewedTime = Date.now();
        renderer.config = config;
        return renderer;
      };

      const _columnIndexes = [0,1,2,3,4,5,6];
      const _hiddenColumns = [];

      const state = {
        "columnIndexes":_columnIndexes,
        "fixedColumnIndexes":[],
        "hiddenColumns":_hiddenColumns,
        "columnWidths":[150,358,210,100,100,107.2890625,86.30078125,114.203125,95.01953125,95.01953125,64.50390625,95.01953125,79.76171875,92.306640625,86.5908203125,38.38671875,118.5322265625,167.72021484375,341.04296875,248.8876953125,266.775390625,177.84765625,49.4189453125,25.3046875,73.591796875,269.416015625,467.5234375,102.35546875,86.30078125],
        "fixedColumnWidths":[79.4453125],
        "rowHeights":{},
        "fixedRowHeights":{},
        "sorted":[]
      };

      jsonModel.setState(state);
      jsonModel.setImage('up-arrow', imageCache['up-arrow']);
      jsonModel.setImage('down-arrow', imageCache['down-arrow']);
    });
  }


  render =  () => {
    return (
      <div className="grid-contain">
        <div className="actions-bg">
          <div className="actions">
            {
            <i onClick={this.openBidOffer} className="fa fa-file-text"></i>
            }
          </div>
        </div>
        <fin-hypergrid id="stock-example">
          <fin-hypergrid-behavior-json></fin-hypergrid-behavior-json>
          <fin-hypergrid-excel></fin-hypergrid-excel>
        </fin-hypergrid>
      </div>
    );
  }
}

export default HyperGrid;
