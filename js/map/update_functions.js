// Written By Samuel Jansson 10/07/2014

function updateCharts(filterKey, divarea, divline) {
    divarea.html("loading...");
    divline.html("loading...");

    var param = null;
    if (filterKey != null)
        param = {filterKey: filterKey};

    $.getJSON('home/GetProductionTotals', param)
     .done(function (result) {
         //debugger;
         if (result.rows.length > 0) {
             var data = new google.visualization.DataTable(result);
             var options;

             options = {
                 width: 500,
                 height: 300,
                 vAxis: { format: 'decimal' }
             };

             var chartarea = new google.visualization.AreaChart(divarea[0]);
             chartarea.draw(data, options);
             var chartline = new google.visualization.LineChart(divline[0]);
             chartline.draw(data, options);
         }
         else {
             divarea.html("<span style=\"color:green\">No production data available</span>");
             divline.html("<span style=\"color:green\">No production data available</span>");
         }                    
     })
     .fail(function (jqxhr, textStatus, error) {
         divarea.html("<span style=\"color:red\">Could not access server content!</span>");
         divline.html("<span style=\"color:red\">Could not access server content!</span>");
       //  debugger;
     });
}

function updateTotalsSum(filterKey, divoil, divgas, divwater, divwells) {
    divoil.val("");
    divgas.val("");
    divwater.val("");
    divwells.val("");

    var param = null;
    if (filterKey != null)
        param = { filterKey: filterKey };

    $.getJSON('home/GetProductionTotalsSum', param)
         .done(function (result) {
             //debugger;
             if (result.rows.length > 0) {

                 divoil.val(result.rows[0].c[0].v);
                 divgas.val(result.rows[0].c[1].v);
                 divwater.val(result.rows[0].c[2].v);
                 divwells.val(result.rows[0].c[3].v);
             }
         })
         .fail(function (jqxhr, textStatus, error) {
            // debugger;
         });
}