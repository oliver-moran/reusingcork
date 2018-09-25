var red = new L.Icon({
  iconUrl: "/js/vendor/leaflet-color-markers/img/marker-icon-red.png",
  shadowUrl: "/js/vendor/leaflet/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41]
});

var showDeleted = (getParameterByName("deleted") == "true");

$(".navbar-default a").on("click", function () {
   $(".navbar-collapse").collapse("hide");
});

var locations = [];
var map;
var CORK_LAT_LNG = [51.8970, -8.475];

$(document).ready(function(){
    $.ajax({
        method: "GET",
        url: "/api/locations"
    }).success(function(data) {
        locations = data;
        startMap();
        initTinyMCE();
    });

    if (!window.File || !window.FileReader || !window.FileList || !window.Blob) {
        console.warn("The File APIs are not fully supported in this browser.");
        $("#file-input-group").hide();
    }
});

function initTinyMCE(notes) {
    tinymce.init({
        selector:'textarea',
        menubar: false,
        plugins: [
            'lists'
        ],
        toolbar: 'bold italic underline | alignleft aligncenter alignright alignjustify | bullist numlist outdent indent',
        height: 200
    });
}

function checkRecaptcha() {
    var response = grecaptcha.getResponse();
    if (response.length == 0) return false;
    else return true;
}

function resetRecaptcha() {
    grecaptcha.reset();
}

function startMap() {
    map = L.map("leaflet-map").setView(CORK_LAT_LNG, 15);
    map.scrollWheelZoom.disable();
    map.locate({
      setView: true,
      maxZoom: 16,
      enableHighAccuracy: true
    });
    map.on('locationfound', function onLocationFound(e) {
        var radius = e.accuracy / 2; // meters
        var km = getDistanceFromLatLonInKm(CORK_LAT_LNG[0],CORK_LAT_LNG[1],e.latlng.lat,e.latlng.lng)
        map.on("moveend", onMoveEnd);
        function onMoveEnd(){
            map.off("moveend", onMoveEnd);
            if (km > 10) {
                map.flyTo(CORK_LAT_LNG, 15);
            }
        }
    });
    if ($("html").hasClass("touch")) {
        map.dragging.disable();
//        map.bounceAtZoomLimits.disable();
        L.control.pan({panOffset: 100}).addTo(map);
    }

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "&copy; <a href=\"https://openstreetmap.org\">OpenStreetMap</a> contributors, <a href=\"https://creativecommons.org/licenses/by-sa/2.0/\">CC-BY-SA</a>"
    }).addTo(map);

    for (var i = 0; i < locations.length; i++) {
        var marker = L.marker([locations[i].lat, locations[i].lng]).addTo(map);
        locations[i].marker = marker;
        bindMarkerHTML(locations[i]);
    }

    if (showDeleted) {
        $.ajax({
            method: "GET",
            url: "/api/locations/deleted"
        }).success(function(deletions) {
            var n = locations.length;
            locations = locations.concat(deletions);
            for (var i = 0; i < deletions.length; i++) {
                var marker = L.marker([deletions[i].lat, deletions[i].lng], {icon: red}).addTo(map);
                locations[n + i].marker = marker;
                bindDeletedMarkerHTML(locations[n + i]);
            }
        });
    }

    var t = null;
    map.on("dblclick", function(){
        clearTimeout(t);
    });

    map.on("click", function(e) {
        clearTimeout(t);
        t = setTimeout(function(){
            var marker = L.marker(e.latlng).addTo(map);
            var data = {
                lat: e.latlng.lat.toFixed(3),
                lng: e.latlng.lng.toFixed(3),
                img: "",
                desc: "",
                notes: "<p></p>"
            }
            initModal("Add a location", data);
            initAddModalButtons(marker, e.latlng.lat, e.latlng.lng);
        }, 500);
    });

};

function initModal(title, data){
    $("#modal-title").html(title);
    $("#modal-lat-lng").html(data.lat + ", " + data.lng);
    $("#edit-modal .marker-image").css("background-image", "url(" + data.img + ")");
    $("#edit-modal .marker-image").attr("data-image", data.img);
    $("#desc-input").val(data.desc);
    tinyMCE.get("notes-input").setContent(data.notes);
    $("#edit-modal .glyphicon-refresh").addClass("hidden");
    $("#edit-modal").modal("show");
}


function initAddModalButtons(marker, lat, lng){
    var doSave = false;
    $("#edit-modal .modal-footer .btn-danger").hide();
    $("#edit-modal .modal-footer .btn-primary").bind("click.add", function(){
        if (!checkRecaptcha()) return;
        if ($("#desc-input").val().trim() == "") return;
        $("#edit-modal .glyphicon-refresh").removeClass("hidden");
        $("#edit-modal").addClass("avoid-clicks");

        getBase64Image(function(base64) {
            var data = {
                lat: lat,
                lng: lng,
                img: base64 || "",
                desc: $("#desc-input").val().trim(),
                notes: tinyMCE.get("notes-input").getContent().trim(),
            }
            $.ajax({
                method: "POST",
                url: "/api/location",
                data: data
            }).success(function(data) {
                doSave = true;
                data.marker = marker;
                locations.push(data);
                bindMarkerHTML(data);
                $("#edit-modal").removeClass("avoid-clicks");
                $("#edit-modal").modal("hide");
            });
        });
    });
    $("#edit-modal").on("hidden.bs.modal", function (e) {
        if (!doSave) map.removeLayer(marker);
        $("#edit-modal .modal-footer .btn-primary").unbind(".add");
        $("#edit-modal").unbind();
        resetRecaptcha();
        document.getElementById("modal-form").reset();
    });
}

function bindMarkerHTML(data){
    var html = "";
    html += "<div class=\"marker-image\" data-image=\"" + data.img + "\" style=\"background-image: url(" + data.img + ")\"></div>";
    html += "<p><strong>" + data.desc + "</strong></p>";
    html += "<p><button onclick=\"javascript:editLocation('" + data.uuid + "');\" class=\"btn btn-default btn-block btn-sm\"><i class=\"glyphicon glyphicon-pencil\"><!-- pencil --></i> Edit this location</button></p>"
    data.marker.bindPopup(html);
}

function bindDeletedMarkerHTML(data){
    var html = "";
    html += "<div class=\"marker-image\" data-image=\"" + data.img + "\" style=\"background-image: url(" + data.img + ")\"></div>";
    html += "<p><strong>" + data.desc + "</strong></p>";
    html += "<p><button onclick=\"javascript:editLocation('" + data.uuid + "', true);\" class=\"btn btn-default btn-block btn-sm\"><i class=\"glyphicon glyphicon-pencil\"><!-- pencil --></i> Edit this location</button></p>"
    data.marker.bindPopup(html);
}

function editLocation(id, isDeleted){
    for (var i = 0; i < locations.length; i++) {
       if (locations[i].uuid == id) {
            var data = {
                uuid: locations[i].uuid,
                lat: parseFloat(locations[i].lat).toFixed(3),
                lng: parseFloat(locations[i].lng).toFixed(3),
                img: locations[i].img,
                desc: locations[i].desc,
                notes: locations[i].notes
            }
            initModal("Edit location", data);
            initUpdateModalButtons(locations[i], isDeleted);
            break;
       }
    }
}

function initUpdateModalButtons(location, isDeleted){
    if (isDeleted) $("#edit-modal .modal-footer .btn-danger").hide();
    else $("#edit-modal .modal-footer .btn-danger").show();
    $("#edit-modal .modal-footer .btn-danger").bind("click.update", function(){
        if (!checkRecaptcha()) return;
        $("#delete-confirm-modal").modal("show");
        $("#delete-confirm-modal .btn-danger").bind("click.confirm", function(){
            $("#delete-confirm-modal").modal("hide");
            $.ajax({
                method: "DELETE",
                url: "/api/location",
                data: {uuid: location.uuid}
            }).done(function() {
                map.removeLayer(location.marker);
                if (showDeleted) {
                    var marker = L.marker([location.lat, location.lng], {icon: red}).addTo(map);
                    location.marker = marker;
                    bindDeletedMarkerHTML(location);
                }
                $("#edit-modal").modal("hide");
            });
        });
    });
    $("#edit-modal .modal-footer .btn-primary").bind("click.update", function(){
        if (!checkRecaptcha()) return;
        if ($("#desc-input").val().trim() == "") return;
        $("#edit-modal .glyphicon-refresh").removeClass("hidden");
        $("#edit-modal").addClass("avoid-clicks");

        getBase64Image(function(base64) {
            location.img = base64 || location.img;
            location.desc = $("#desc-input").val().trim();
            location.notes = tinyMCE.get("notes-input").getContent().trim();
            var data = {
                uuid: location.uuid,
                lat: location.lat,
                lng: location.lng,
                img: location.img,
                desc: location.desc,
                notes: location.notes
            }
            $.ajax({
                method: "PUT",
                url: "/api/location",
                data: data
            }).done(function() {
                if (isDeleted) {
                    map.removeLayer(location.marker);
                    var marker = L.marker([location.lat, location.lng]).addTo(map);
                    location.marker = marker;
                }
                bindMarkerHTML(location);
                $("#edit-modal").removeClass("avoid-clicks");
                $("#edit-modal").modal("hide");
            });
        });
    });
    $("#edit-modal").on("hidden.bs.modal", function (e) {
        $("#edit-modal .modal-footer .btn-danger").unbind(".update");
        $("#edit-modal .modal-footer .btn-primary").unbind(".update");
        $("#edit-modal").unbind();
        resetRecaptcha();
        document.getElementById("modal-form").reset();
    });
}

$("#delete-confirm-modal").on("show.bs.modal", function (e) {
    $("#edit-modal").addClass("grayscale");
});

$("#delete-confirm-modal").on("hidden.bs.modal", function (e) {
    $("#delete-confirm-modal .btn-danger").unbind(".confirm");
    $("#edit-modal").removeClass("grayscale");
});


$("#file-input").on("change", function() {
    getBase64Image(function(uri){
        $("#edit-modal .marker-image").css("background-image", "url(" + uri + ")");
        $("#edit-modal .marker-image").attr("data-image", uri);
    });
});
function getBase64Image(cb){
    try {
        var file = document.getElementById("file-input").files[0];
        var reader = new FileReader();
        reader = new FileReader();
        reader.onload = function(){
            cb(reader.result);
        };
        reader.onerror = reader.onerror = function(){
            cb("");
        };
        reader.readAsDataURL(file);
    } catch (err) {
        cb("");
    }
}

// http://stackoverflow.com/questions/901115/how-can-i-get-query-string-values-in-javascript
function getParameterByName(name, url) {
    if (!url) {
      url = window.location.href;
    }
    name = name.replace(/[\[\]]/g, "\\$&");
    var regex = new RegExp("[?&]" + name + "(=([^&#]*)|&|#|$)"),
        results = regex.exec(url);
    if (!results) return null;
    if (!results[2]) return '';
    return decodeURIComponent(results[2].replace(/\+/g, " "));
}

// http://stackoverflow.com/questions/27928/calculate-distance-between-two-latitude-longitude-points-haversine-formula
function getDistanceFromLatLonInKm(lat1,lon1,lat2,lon2) {
  var R = 6371; // Radius of the earth in km
  var dLat = deg2rad(lat2-lat1);  // deg2rad below
  var dLon = deg2rad(lon2-lon1);
  var a =
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) *
    Math.sin(dLon/2) * Math.sin(dLon/2)
    ;
  var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  var d = R * c; // Distance in km
  return d;
}

function deg2rad(deg) {
  return deg * (Math.PI/180)
}
