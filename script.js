/***************************************************
 * EPSG:25832 => WGS84
 ***************************************************/
proj4.defs("EPSG:25832", "+proj=utm +zone=32 +ellps=GRS80 +datum=ETRS89 +units=m +no_defs");

function convertToWGS84(x, y) {
  let result = proj4("EPSG:25832", "EPSG:4326", [y, x]); // Bytter x og y
  console.log("convertToWGS84 input:", x, y, "=> output:", result);
  return [result[1], result[0]]; // Returnerer lat, lon i korrekt rækkefølge
}

/***************************************************
 * Hjælpefunktion til at kopiere tekst til clipboard
 ***************************************************/
function copyToClipboard(str) {
  // [ÆNDRET] Erstat bogstavelige \n med rigtige linjeskift
  let finalStr = str.replace(/\\n/g, "\n");

  navigator.clipboard.writeText(finalStr)
    .then(() => {
      console.log("Copied to clipboard:", finalStr);
    })
    .catch(err => {
      console.error("Could not copy text:", err);
    });
}

/***************************************************
 * Ford workshops data – hardcoded (konverteret fra din JSON-liste)
 ***************************************************/
const fordWorkshopsData = [
  {
    "id": 671,
    "name": "Ford Aabenraa",
    "store_code": "01602v",
    "email": "salg@jespjessen.dk",
    "phone": "70818354",
    "externalDealerSite": "https://www.ford-karvil.dk/",
    "external_online_servicebooking": "https://www.ford-karvil.dk/book-vaerkstedstid-online-ford",
    "onlineWorkshopBooking": false,
    "brands": ["ford"],
    "address": {
      "street": "Gasværksvej 34",
      "zipcode": "6200",
      "city": "Aabenraa",
      "country": "Danmark",
      "lat": 55.046964,
      "lng": 9.422979
    },
    "business": {
      "id": 91,
      "name": "Ford Danmark ",
      "identifier": "62532319"
    },
    "distributor": {
      "id": 340,
      "name": "Karvil Biler A/S",
      "identifier": "26172403FORD"
    },
    "category": {
      "id": 3,
      "name": "Workshop",
      "code": "workshop"
    },
    "opening_hours": [
      {"open_day": "monday", "open_day_label": "Mandag", "open_time": "07:00", "close_day": "monday", "close_day_label": "Mandag", "close_time": "17:00", "sorting": 1},
      {"open_day": "tuesday", "open_day_label": "Tirsdag", "open_time": "07:00", "close_day": "tuesday", "close_day_label": "Tirsdag", "close_time": "17:00", "sorting": 2},
      {"open_day": "wednesday", "open_day_label": "Onsdag", "open_time": "07:00", "close_day": "wednesday", "close_day_label": "Onsdag", "close_time": "17:00", "sorting": 3},
      {"open_day": "thursday", "open_day_label": "Torsdag", "open_time": "07:00", "close_day": "thursday", "close_day_label": "Torsdag", "close_time": "17:00", "sorting": 4},
      {"open_day": "friday", "open_day_label": "Fredag", "open_time": "07:00", "close_day": "friday", "close_day_label": "Fredag", "close_time": "17:00", "sorting": 5},
      {"open_day": "saturday", "open_day_label": "Lørdag", "open_time": "Lukket", "close_day": "saturday", "close_day_label": "Lørdag", "close_time": "", "sorting": 6},
      {"open_day": "sunday", "open_day_label": "Søndag", "open_time": "Lukket", "close_day": "sunday", "close_day_label": "Søndag", "close_time": "", "sorting": 7}
    ]
  },
  {
    "id": 796,
    "name": "Ford Aalborg SV",
    "store_code": "13200v",
    "email": "service@indkilde.dk",
    "phone": "96349000",
    "externalDealerSite": "https://www.ford-indkilde.dk/",
    "external_online_servicebooking": "https://www.ford-indkilde.dk/book-service-online-indkilde",
    "onlineWorkshopBooking": false,
    "brands": ["ford"],
    "address": {
      "street": "Hobrovej 325",
      "zipcode": "9200",
      "city": "Aalborg SV",
      "country": "Danmark",
      "lat": 57.016312,
      "lng": 9.896588
    },
    "business": {
      "id": 91,
      "name": "Ford Danmark ",
      "identifier": "62532319"
    },
    "distributor": {
      "id": 322,
      "name": "Indkilde Auto A/S",
      "identifier": "37887315"
    },
    "category": {
      "id": 3,
      "name": "Workshop",
      "code": "workshop"
    },
    "opening_hours": [
      {"open_day": "monday", "open_day_label": "Mandag", "open_time": "06:30", "close_day": "monday", "close_day_label": "Mandag", "close_time": "17:45", "sorting": 1},
      {"open_day": "tuesday", "open_day_label": "Tirsdag", "open_time": "06:30", "close_day": "tuesday", "close_day_label": "Tirsdag", "close_time": "17:45", "sorting": 2},
      {"open_day": "wednesday", "open_day_label": "Onsdag", "open_time": "06:30", "close_day": "wednesday", "close_day_label": "Onsdag", "close_time": "18:00", "sorting": 3},
      {"open_day": "thursday", "open_day_label": "Torsdag", "open_time": "06:30", "close_day": "thursday", "close_day_label": "Torsdag", "close_time": "18:00", "sorting": 4},
      {"open_day": "friday", "open_day_label": "Fredag", "open_time": "06:30", "close_day": "friday", "close_day_label": "Fredag", "close_time": "16:00", "sorting": 5},
      {"open_day": "saturday", "open_day_label": "Lørdag", "open_time": "Lukket", "close_day": "saturday", "close_day_label": "Lørdag", "close_time": "", "sorting": 6},
      {"open_day": "sunday", "open_day_label": "Søndag", "open_time": "Lukket", "close_day": "sunday", "close_day_label": "Søndag", "close_time": "", "sorting": 7}
    ]
  },
  {
    "id": 698,
    "name": "Ford Aalborg Ø",
    "store_code": "03600v",
    "email": "serviceaal@hosbond.dk",
    "phone": "99303500",
    "externalDealerSite": "https://www.hosbond.dk/",
    "external_online_servicebooking": "https://www.hosbond.dk/bestil-ford-service-brdr-hosbond",
    "onlineWorkshopBooking": false,
    "brands": ["ford"],
    "address": {
      "street": "Skjernvej 4B",
      "zipcode": "9220",
      "city": "Aalborg Ø",
      "country": "Danmark",
      "lat": 57.02993,
      "lng": 9.97507
    },
    "business": {
      "id": 91,
      "name": "Ford Danmark ",
      "identifier": "62532319"
    },
    "distributor": {
      "id": 305,
      "name": "Brdr. Hosbond A/S",
      "identifier": "50496317"
    },
    "category": {
      "id": 3,
      "name": "Workshop",
      "code": "workshop"
    },
    "opening_hours": [
      {"open_day": "monday", "open_day_label": "Mandag", "open_time": "06:30", "close_day": "monday", "close_day_label": "Mandag", "close_time": "17:30", "sorting": 1},
      {"open_day": "tuesday", "open_day_label": "Tirsdag", "open_time": "06:30", "close_day": "tuesday", "close_day_label": "Tirsdag", "close_time": "21:00", "sorting": 2},
      {"open_day": "wednesday", "open_day_label": "Onsdag", "open_time": "06:30", "close_day": "wednesday", "close_day_label": "Onsdag", "close_time": "17:30", "sorting": 3},
      {"open_day": "thursday", "open_day_label": "Torsdag", "open_time": "06:30", "close_day": "thursday", "close_day_label": "Torsdag", "close_time": "21:00", "sorting": 4},
      {"open_day": "friday", "open_day_label": "Fredag", "open_time": "06:30", "close_day": "friday", "close_day_label": "Fredag", "close_time": "16:00", "sorting": 5},
      {"open_day": "saturday", "open_day_label": "Lørdag", "open_time": "Lukket", "close_day": "saturday", "close_day_label": "Lørdag", "close_time": "", "sorting": 6},
      {"open_day": "sunday", "open_day_label": "Søndag", "open_time": "Lukket", "close_day": "sunday", "close_day_label": "Søndag", "close_time": "", "sorting": 7}
    ]
  },
  {
    "id": 805,
    "name": "Ford Aarhus V",
    "store_code": "18100v",
    "email": "5030fm@viabiler.dk",
    "phone": "86754600",
    "externalDealerSite": "https://www.viabiler-ford.dk/",
    "external_online_servicebooking": "https://www.viabiler-ford.dk/side/116",
    "onlineWorkshopBooking": false,
    "brands": ["ford"],
    "address": {
      "street": "Vintervej 11",
      "zipcode": "8210",
      "city": "Aarhus V",
      "country": "Danmark",
      "lat": 56.175831,
      "lng": 10.147455
    },
    "business": {
      "id": 91,
      "name": "Ford Danmark ",
      "identifier": "62532319"
    },
    "distributor": {
      "id": 326,
      "name": "Via Biler A/S",
      "identifier": "44883112"
    },
    "category": {
      "id": 3,
      "name": "Workshop",
      "code": "workshop"
    },
    "opening_hours": [
      {"open_day": "monday", "open_day_label": "Mandag", "open_time": "06:00", "close_day": "monday", "close_day_label": "Mandag", "close_time": "17:00", "sorting": 1},
      {"open_day": "tuesday", "open_day_label": "Tirsdag", "open_time": "06:00", "close_day": "tuesday", "close_day_label": "Tirsdag", "close_time": "17:00", "sorting": 2},
      {"open_day": "wednesday", "open_day_label": "Onsdag", "open_time": "06:00", "close_day": "wednesday", "close_day_label": "Onsdag", "close_time": "17:00", "sorting": 3},
      {"open_day": "thursday", "open_day_label": "Torsdag", "open_time": "06:00", "close_day": "thursday", "close_day_label": "Torsdag", "close_time": "17:00", "sorting": 4},
      {"open_day": "friday", "open_day_label": "Fredag", "open_time": "06:00", "close_day": "friday", "close_day_label": "Fredag", "close_time": "17:00", "sorting": 5},
      {"open_day": "saturday", "open_day_label": "Lørdag", "open_time": "Lukket", "close_day": "saturday", "close_day_label": "Lørdag", "close_time": "", "sorting": 6},
      {"open_day": "sunday", "open_day_label": "Søndag", "open_time": "Lukket", "close_day": "sunday", "close_day_label": "Søndag", "close_time": "", "sorting": 7}
    ]
  },
  {
    "id": 814,
    "name": "Ford Aars",
    "store_code": "18600v",
    "email": "vaerksted@jensbuus.dk",
    "phone": "98621299",
    "externalDealerSite": "https://ford.jensbuus.dk/",
    "external_online_servicebooking": "https://ford.jensbuus.dk/kontakt/formularer/book-service",
    "onlineWorkshopBooking": false,
    "brands": ["ford"],
    "address": {
      "street": "Hobrovej 1-7",
      "zipcode": "9600",
      "city": "Aars",
      "country": "Danmark",
      "lat": 56.805019,
      "lng": 9.528759
    },
    "business": {
      "id": 91,
      "name": "Ford Danmark ",
      "identifier": "62532319"
    },
    "distributor": {
      "id": 327,
      "name": "Jens Buus A/S",
      "identifier": "20271175"
    },
    "category": {
      "id": 3,
      "name": "Workshop",
      "code": "workshop"
    },
    "opening_hours": [
      {"open_day": "monday", "open_day_label": "Mandag", "open_time": "07:00", "close_day": "monday", "close_day_label": "Mandag", "close_time": "17:00", "sorting": 1},
      {"open_day": "tuesday", "open_day_label": "Tirsdag", "open_time": "07:00", "close_day": "tuesday", "close_day_label": "Tirsdag", "close_time": "17:00", "sorting": 2},
      {"open_day": "wednesday", "open_day_label": "Onsdag", "open_time": "07:00", "close_day": "wednesday", "close_day_label": "Onsdag", "close_time": "17:00", "sorting": 3},
      {"open_day": "thursday", "open_day_label": "Torsdag", "open_time": "07:00", "close_day": "thursday", "close_day_label": "Torsdag", "close_time": "17:00", "sorting": 4},
      {"open_day": "friday", "open_day_label": "Fredag", "open_time": "07:00", "close_day": "friday", "close_day_label": "Fredag", "close_time": "17:00", "sorting": 5},
      {"open_day": "saturday", "open_day_label": "Lørdag", "open_time": "Lukket", "close_day": "saturday", "close_day_label": "Lørdag", "close_time": "", "sorting": 6},
      {"open_day": "sunday", "open_day_label": "Søndag", "open_time": "Lukket", "close_day": "sunday", "close_day_label": "Søndag", "close_time": "", "sorting": 7}
    ]
  },
  {
    "id": 650,
    "name": "Ford Ballerup",
    "store_code": "01100v",
    "email": "salg-e4@andersenbiler.dk",
    "phone": " 44440010",
    "externalDealerSite": "https://www.andersenbiler-ford.dk/",
    "external_online_servicebooking": "https://www.andersenbiler-ford.dk/book-service-hos-andersen-biler",
    "onlineWorkshopBooking": false,
    "brands": ["ford"],
    "address": {
      "street": "Energivej 4",
      "zipcode": "2750",
      "city": "Ballerup",
      "country": "Danmark",
      "lat": 55.724042,
      "lng": 12.383866
    },
    "business": {
      "id": 91,
      "name": "Ford Danmark ",
      "identifier": "62532319"
    },
    "distributor": {
      "id": 338,
      "name": "Andersen Biler A/S Ford",
      "identifier": "17694707F"
    },
    "category": {
      "id": 3,
      "name": "Workshop",
      "code": "workshop"
    },
    "opening_hours": [
      {"open_day": "monday", "open_day_label": "Mandag", "open_time": "06:30", "close_day": "monday", "close_day_label": "Mandag", "close_time": "17:30", "sorting": 1},
      {"open_day": "tuesday", "open_day_label": "Tirsdag", "open_time": "06:30", "close_day": "tuesday", "close_day_label": "Tirsdag", "close_time": "17:30", "sorting": 2},
      {"open_day": "wednesday", "open_day_label": "Onsdag", "open_time": "06:30", "close_day": "wednesday", "close_day_label": "Onsdag", "close_time": "17:30", "sorting": 3},
      {"open_day": "thursday", "open_day_label": "Torsdag", "open_time": "06:30", "close_day": "thursday", "close_day_label": "Torsdag", "close_time": "17:30", "sorting": 4},
      {"open_day": "friday", "open_day_label": "Fredag", "open_time": "06:30", "close_day": "friday", "close_day_label": "Fredag", "close_time": "17:30", "sorting": 5},
      {"open_day": "saturday", "open_day_label": "Lørdag", "open_time": "Lukket", "close_day": "saturday", "close_day_label": "Lørdag", "close_time": "", "sorting": 6},
      {"open_day": "sunday", "open_day_label": "Søndag", "open_time": "Lukket", "close_day": "sunday", "close_day_label": "Søndag", "close_time": "", "sorting": 7}
    ]
  },
  {
    "id": 787,
    "name": "Ford Billund",
    "store_code": "11730v",
    "email": "mail@bbvejle.dk",
    "phone": "75338912",
    "externalDealerSite": "https://www.ford-bbvejle.dk/",
    "external_online_servicebooking": "https://www.ford-bbvejle.dk/side/122",
    "onlineWorkshopBooking": false,
    "brands": ["ford"],
    "address": {
      "street": "Hedegårdsvej 2",
      "zipcode": "7190",
      "city": "Billund",
      "country": "Danmark",
      "lat": 55.716331,
      "lng": 9.127512
    },
    "business": {
      "id": 91,
      "name": "Ford Danmark ",
      "identifier": "62532319"
    },
    "distributor": {
      "id": 319,
      "name": "Bøje & Brøchner A/S",
      "identifier": "27763251"
    },
    "category": {
      "id": 3,
      "name": "Workshop",
      "code": "workshop"
    },
    "opening_hours": [
      {"open_day": "monday", "open_day_label": "Mandag", "open_time": "07:00", "close_day": "monday", "close_day_label": "Mandag", "close_time": "17:30", "sorting": 1},
      {"open_day": "tuesday", "open_day_label": "Tirsdag", "open_time": "07:00", "close_day": "tuesday", "close_day_label": "Tirsdag", "close_time": "17:30", "sorting": 2},
      {"open_day": "wednesday", "open_day_label": "Onsdag", "open_time": "07:00", "close_day": "wednesday", "close_day_label": "Onsdag", "close_time": "17:30", "sorting": 3},
      {"open_day": "thursday", "open_day_label": "Torsdag", "open_time": "07:00", "close_day": "thursday", "close_day_label": "Torsdag", "close_time": "17:30", "sorting": 4},
      {"open_day": "friday", "open_day_label": "Fredag", "open_time": "07:00", "close_day": "friday", "close_day_label": "Fredag", "close_time": "15:00", "sorting": 5},
      {"open_day": "saturday", "open_day_label": "Lørdag", "open_time": "Lukket", "close_day": "saturday", "close_day_label": "Lørdag", "close_time": "", "sorting": 6},
      {"open_day": "sunday", "open_day_label": "Søndag", "open_time": "Lukket", "close_day": "sunday", "close_day_label": "Søndag", "close_time": "", "sorting": 7}
    ]
  },
  {
    "id": 641,
    "name": "Ford Birkerød",
    "store_code": "02101v",
    "email": "birkerod@bn.dk",
    "phone": "70808660",
    "externalDealerSite": "https://ford.bn.dk/",
    "external_online_servicebooking": "https://ford.bn.dk/online-service-booking-ford-bjarne-nielsen",
    "onlineWorkshopBooking": false,
    "brands": ["ford"],
    "address": {
      "street": "Birkerød Kongevej 37-39",
      "zipcode": "3460",
      "city": "Birkerød",
      "country": "Danmark",
      "lat": 55.83916,
      "lng": 12.44313
    },
    "business": {
      "id": 91,
      "name": "Ford Danmark ",
      "identifier": "62532319"
    },
    "distributor": {
      "id": 302,
      "name": "Bjarne Nielsen A/S",
      "identifier": "31943140"
    },
    "category": {
      "id": 3,
      "name": "Workshop",
      "code": "workshop"
    },
    "opening_hours": [
      {"open_day": "monday", "open_day_label": "Mandag", "open_time": "07:00", "close_day": "monday", "close_day_label": "Mandag", "close_time": "17:00", "sorting": 1},
      {"open_day": "tuesday", "open_day_label": "Tirsdag", "open_time": "07:00", "close_day": "tuesday", "close_day_label": "Tirsdag", "close_time": "17:00", "sorting": 2},
      {"open_day": "wednesday", "open_day_label": "Onsdag", "open_time": "07:00", "close_day": "wednesday", "close_day_label": "Onsdag", "close_time": "17:00", "sorting": 3},
      {"open_day": "thursday", "open_day_label": "Torsdag", "open_time": "07:00", "close_day": "thursday", "close_day_label": "Torsdag", "close_time": "17:00", "sorting": 4},
      {"open_day": "friday", "open_day_label": "Fredag", "open_time": "07:00", "close_day": "friday", "close_day_label": "Fredag", "close_time": "17:00", "sorting": 5},
      {"open_day": "saturday", "open_day_label": "Lørdag", "open_time": "Lukket", "close_day": "saturday", "close_day_label": "Lørdag", "close_time": "", "sorting": 6},
      {"open_day": "sunday", "open_day_label": "Søndag", "open_time": "Lukket", "close_day": "sunday", "close_day_label": "Søndag", "close_time": "", "sorting": 7}
    ]
  },
  {
    "id": 632,
    "name": "Ford Bramming",
    "store_code": "00800v",
    "email": "rd@autocramer.dk",
    "phone": "75173333",
    "externalDealerSite": "https://www.ford.autocramer.dk/",
    "external_online_servicebooking": "https://www.ford.autocramer.dk/online-service-booking-ford-vaerksted-autocramer-bramming-ribe",
    "onlineWorkshopBooking": false,
    "brands": ["ford"],
    "address": {
      "street": "Storegade 100",
      "zipcode": "6740",
      "city": "Bramming",
      "country": "Danmark",
      "lat": 55.46737,
      "lng": 8.68765
    },
    "business": {
      "id": 91,
      "name": "Ford Danmark ",
      "identifier": "62532319"
    },
    "distributor": {
      "id": 292,
      "name": "Auto-Cramer A/S",
      "identifier": "80144415"
    },
    "category": {
      "id": 3,
      "name": "Workshop",
      "code": "workshop"
    },
    "opening_hours": [
      {"open_day": "monday", "open_day_label": "Mandag", "open_time": "07:00", "close_day": "monday", "close_day_label": "Mandag", "close_time": "17:30", "sorting": 1},
      {"open_day": "tuesday", "open_day_label": "Tirsdag", "open_time": "07:00", "close_day": "tuesday", "close_day_label": "Tirsdag", "close_time": "17:30", "sorting": 2},
      {"open_day": "wednesday", "open_day_label": "Onsdag", "open_time": "07:00", "close_day": "wednesday", "close_day_label": "Onsdag", "close_time": "17:30", "sorting": 3},
      {"open_day": "thursday", "open_day_label": "Torsdag", "open_time": "07:00", "close_day": "thursday", "close_day_label": "Torsdag", "close_time": "17:30", "sorting": 4},
      {"open_day": "friday", "open_day_label": "Fredag", "open_time": "07:00", "close_day": "friday", "close_day_label": "Fredag", "close_time": "17:30", "sorting": 5},
      {"open_day": "saturday", "open_day_label": "Lørdag", "open_time": "Lukket", "close_day": "saturday", "close_day_label": "Lørdag", "close_time": "", "sorting": 6},
      {"open_day": "sunday", "open_day_label": "Søndag", "open_time": "Lukket", "close_day": "sunday", "close_day_label": "Søndag", "close_time": "", "sorting": 7}
    ]
  },
  {
    "id": 730,
    "name": "Ford Brøndby",
    "store_code": "04830v",
    "email": "brondby@hessel.dk",
    "phone": "73125700",
    "externalDealerSite": "https://ford.hessel.dk/",
    "external_online_servicebooking": "https://www.hessel.dk/vaerksted-service/booking?step=1",
    "onlineWorkshopBooking": false,
    "brands": ["ford"],
    "address": {
      "street": "Vibeholmsvej 25",
      "zipcode": "2605",
      "city": "Brøndby",
      "country": "Danmark",
      "lat": 55.665631,
      "lng": 12.416796
    },
    "business": {
      "id": 91,
      "name": "Ford Danmark ",
      "identifier": "62532319"
    },
    "distributor": {
      "id": 309,
      "name": "Ejner Hessel A/S",
      "identifier": "58811211"
    },
    "category": {
      "id": 3,
      "name": "Workshop",
      "code": "workshop"
    },
    "opening_hours": [
      {"open_day": "monday", "open_day_label": "Mandag", "open_time": "06:30", "close_day": "monday", "close_day_label": "Mandag", "close_time": "17:30", "sorting": 1},
      {"open_day": "tuesday", "open_day_label": "Tirsdag", "open_time": "06:30", "close_day": "tuesday", "close_day_label": "Tirsdag", "close_time": "17:30", "sorting": 2},
      {"open_day": "wednesday", "open_day_label": "Onsdag", "open_time": "06:30", "close_day": "wednesday", "close_day_label": "Onsdag", "close_time": "17:30", "sorting": 3},
      {"open_day": "thursday", "open_day_label": "Torsdag", "open_time": "06:30", "close_day": "thursday", "close_day_label": "Torsdag", "close_time": "17:30", "sorting": 4},
      {"open_day": "friday", "open_day_label": "Fredag", "open_time": "06:30", "close_day": "friday", "close_day_label": "Fredag", "close_time": "17:30", "sorting": 5},
      {"open_day": "saturday", "open_day_label": "Lørdag", "open_time": "Lukket", "close_day": "saturday", "close_day_label": "Lørdag", "close_time": "", "sorting": 6},
      {"open_day": "sunday", "open_day_label": "Søndag", "open_time": "Lukket", "close_day": "sunday", "close_day_label": "Søndag", "close_time": "", "sorting": 7}
    ]
  },
  {
    "id": 742,
    "name": "Ford Horsens",
    "store_code": "07302v",
    "email": "indskrivning.horsens@autohuset-vestergaard.dk",
    "phone": "75648000",
    "externalDealerSite": "https://ford.autohuset-vestergaard.dk/",
    "external_online_servicebooking": "https://ford.autohuset-vestergaard.dk/autohuset-vestergaard-bestil-service",
    "onlineWorkshopBooking": false,
    "brands": ["ford"],
    "address": {
      "street": "Ormhøjgårdvej 2",
      "zipcode": "8700",
      "city": "Horsens",
      "country": "Danmark",
      "lat": 55.845057,
      "lng": 9.834265
    },
    "business": {
      "id": 91,
      "name": "Ford Danmark ",
      "identifier": "62532319"
    },
    "distributor": {
      "id": 312,
      "name": "Autohuset Vestergaard A/S",
      "identifier": "18930579"
    },
    "category": {
      "id": 3,
      "name": "Workshop",
      "code": "workshop"
    },
    "opening_hours": [
      {"open_day": "monday", "open_day_label": "Mandag", "open_time": "06:00", "close_day": "monday", "close_day_label": "Mandag", "close_time": "17:00", "sorting": 1},
      {"open_day": "tuesday", "open_day_label": "Tirsdag", "open_time": "06:00", "close_day": "tuesday", "close_day_label": "Tirsdag", "close_time": "17:00", "sorting": 2},
      {"open_day": "wednesday", "open_day_label": "Onsdag", "open_time": "06:00", "close_day": "wednesday", "close_day_label": "Onsdag", "close_time": "17:00", "sorting": 3},
      {"open_day": "thursday", "open_day_label": "Torsdag", "open_time": "06:00", "close_day": "thursday", "close_day_label": "Torsdag", "close_time": "17:00", "sorting": 4},
      {"open_day": "friday", "open_day_label": "Fredag", "open_time": "06:00", "close_day": "friday", "close_day_label": "Fredag", "close_time": "17:00", "sorting": 5},
      {"open_day": "saturday", "open_day_label": "Lørdag", "open_time": "Lukket", "close_day": "saturday", "close_day_label": "Lørdag", "close_time": "", "sorting": 6},
      {"open_day": "sunday", "open_day_label": "Søndag", "open_time": "Lukket", "close_day": "sunday", "close_day_label": "Søndag", "close_time": "", "sorting": 7}
    ]
  },
  {
    "id": 751,
    "name": "Ford Næstved",
    "store_code": "07400v",
    "email": "selandia@selandia-auto.dk",
    "phone": "55721414",
    "externalDealerSite": "https://selandia-auto.dk/",
    "external_online_servicebooking": "https://selandia-auto.dk/book/",
    "onlineWorkshopBooking": false,
    "brands": ["ford"],
    "address": {
      "street": "Holsted Park 2",
      "zipcode": "4700",
      "city": "Næstved",
      "country": "Danmark",
      "lat": 55.249617,
      "lng": 11.775795
    },
    "business": {
      "id": 91,
      "name": "Ford Danmark ",
      "identifier": "62532319"
    },
    "distributor": {
      "id": 313,
      "name": "Selandia Automobiler A/S",
      "identifier": "21274097"
    },
    "category": {
      "id": 3,
      "name": "Workshop",
      "code": "workshop"
    },
    "opening_hours": [
      {"open_day": "monday", "open_day_label": "Mandag", "open_time": "07:30", "close_day": "monday", "close_day_label": "Mandag", "close_time": "17:30", "sorting": 1},
      {"open_day": "tuesday", "open_day_label": "Tirsdag", "open_time": "07:30", "close_day": "tuesday", "close_day_label": "Tirsdag", "close_time": "17:30", "sorting": 2},
      {"open_day": "wednesday", "open_day_label": "Onsdag", "open_time": "07:30", "close_day": "wednesday", "close_day_label": "Onsdag", "close_time": "17:30", "sorting": 3},
      {"open_day": "thursday", "open_day_label": "Torsdag", "open_time": "07:30", "close_day": "thursday", "close_day_label": "Torsdag", "close_time": "17:30", "sorting": 4},
      {"open_day": "friday", "open_day_label": "Fredag", "open_time": "07:30", "close_day": "friday", "close_day_label": "Fredag", "close_time": "17:30", "sorting": 5},
      {"open_day": "saturday", "open_day_label": "Lørdag", "open_time": "Lukket", "close_day": "saturday", "close_day_label": "Lørdag", "close_time": "", "sorting": 6},
      {"open_day": "sunday", "open_day_label": "Søndag", "open_time": "Lukket", "close_day": "sunday", "close_day_label": "Søndag", "close_time": "", "sorting": 7}
    ]
  },
  {
    "id": 763,
    "name": "Ford Risskov",
    "store_code": "07506v",
    "email": "service.risskov@autohus.dk",
    "phone": "87466000",
    "externalDealerSite": "https://ford.autohus.dk/",
    "external_online_servicebooking": "https://ford.autohus.dk/book-service-pedersen-og-nielsen",
    "onlineWorkshopBooking": false,
    "brands": ["ford"],
    "address": {
      "street": "Ravnsøvej 2",
      "zipcode": "8240",
      "city": "Risskov",
      "country": "Danmark",
      "lat": 56.204772,
      "lng": 10.253081
    },
    "business": {
      "id": 91,
      "name": "Ford Danmark ",
      "identifier": "62532319"
    },
    "distributor": {
      "id": 314,
      "name": "Pedersen & Nielsen Automobilfor. A/S",
      "identifier": "14854738"
    },
    "category": {
      "id": 3,
      "name": "Workshop",
      "code": "workshop"
    },
    "opening_hours": [
      {"open_day": "monday", "open_day_label": "Mandag", "open_time": "07:00", "close_day": "monday", "close_day_label": "Mandag", "close_time": "17:00", "sorting": 1},
      {"open_day": "tuesday", "open_day_label": "Tirsdag", "open_time": "07:30", "close_day": "tuesday", "close_day_label": "Tirsdag", "close_time": "21:00", "sorting": 2},
      {"open_day": "wednesday", "open_day_label": "Onsdag", "open_time": "07:30", "close_day": "wednesday", "close_day_label": "Onsdag", "close_time": "17:30", "sorting": 3},
      {"open_day": "thursday", "open_day_label": "Torsdag", "open_time": "07:30", "close_day": "thursday", "close_day_label": "Torsdag", "close_time": "21:00", "sorting": 4},
      {"open_day": "friday", "open_day_label": "Fredag", "open_time": "07:30", "close_day": "friday", "close_day_label": "Fredag", "close_time": "16:00", "sorting": 5},
      {"open_day": "saturday", "open_day_label": "Lørdag", "open_time": "Lukket", "close_day": "saturday", "close_day_label": "Lørdag", "close_time": "", "sorting": 6},
      {"open_day": "sunday", "open_day_label": "Søndag", "open_time": "Lukket", "close_day": "sunday", "close_day_label": "Søndag", "close_time": "", "sorting": 7}
    ]
  },
  {
    "id": 802,
    "name": "Ford Roskilde",
    "store_code": "17200v",
    "email": "michaelbo.nielsen@gunnerdue.dk",
    "phone": "46756900",
    "externalDealerSite": "https://ford.gunnerdue.dk/",
    "external_online_servicebooking": "https://ford.gunnerdue.dk/online-service-booking-gunner-due",
    "onlineWorkshopBooking": false,
    "brands": ["ford"],
    "address": {
      "street": "Københavnsvej 148",
      "zipcode": "4000",
      "city": "Roskilde",
      "country": "Danmark",
      "lat": 55.642502,
      "lng": 12.119024
    },
    "business": {
      "id": 91,
      "name": "Ford Danmark ",
      "identifier": "62532319"
    },
    "distributor": {
      "id": 324,
      "name": "Gunner Due Biler Roskilde A/S",
      "identifier": "13352291"
    },
    "category": {
      "id": 3,
      "name": "Workshop",
      "code": "workshop"
    },
    "opening_hours": [
      {"open_day": "monday", "open_day_label": "Mandag", "open_time": "06:30", "close_day": "monday", "close_day_label": "Mandag", "close_time": "17:30", "sorting": 1},
      {"open_day": "tuesday", "open_day_label": "Tirsdag", "open_time": "06:30", "close_day": "tuesday", "close_day_label": "Tirsdag", "close_time": "17:30", "sorting": 2},
      {"open_day": "wednesday", "open_day_label": "Onsdag", "open_time": "06:30", "close_day": "wednesday", "close_day_label": "Onsdag", "close_time": "17:30", "sorting": 3},
      {"open_day": "thursday", "open_day_label": "Torsdag", "open_time": "06:30", "close_day": "thursday", "close_day_label": "Torsdag", "close_time": "17:30", "sorting": 4},
      {"open_day": "friday", "open_day_label": "Fredag", "open_time": "06:30", "close_day": "friday", "close_day_label": "Fredag", "close_time": "17:30", "sorting": 5},
      {"open_day": "saturday", "open_day_label": "Lørdag", "open_time": "Lukket", "close_day": "saturday", "close_day_label": "Lørdag", "close_time": "", "sorting": 6},
      {"open_day": "sunday", "open_day_label": "Søndag", "open_time": "Lukket", "close_day": "sunday", "close_day_label": "Søndag", "close_time": "", "sorting": 7}
    ]
  },
  {
    "id": 695,
    "name": "Ford Rønne",
    "store_code": "02805v",
    "email": "bornholm@bilhusetelmer.dk",
    "phone": "56950804",
    "externalDealerSite": "https://www.ford-bilhusetelmer.dk/",
    "external_online_servicebooking": "https://www.ford-bilhusetelmer.dk/kontakt/formularer/book-service",
    "onlineWorkshopBooking": false,
    "brands": ["ford"],
    "address": {
      "street": "Aakirkebyvej 51",
      "zipcode": "3700",
      "city": "Rønne",
      "country": "Danmark",
      "lat": 55.09718,
      "lng": 14.71473
    },
    "business": {
      "id": 91,
      "name": "Ford Danmark ",
      "identifier": "62532319"
    },
    "distributor": {
      "id": 304,
      "name": "Bilhuset Elmer A/S",
      "identifier": "18454033"
    },
    "category": {
      "id": 3,
      "name": "Workshop",
      "code": "workshop"
    },
    "opening_hours": [
      {"open_day": "monday", "open_day_label": "Mandag", "open_time": "07:30", "close_day": "monday", "close_day_label": "Mandag", "close_time": "17:30", "sorting": 1},
      {"open_day": "tuesday", "open_day_label": "Tirsdag", "open_time": "07:30", "close_day": "tuesday", "close_day_label": "Tirsdag", "close_time": "17:30", "sorting": 2},
      {"open_day": "wednesday", "open_day_label": "Onsdag", "open_time": "07:30", "close_day": "wednesday", "close_day_label": "Onsdag", "close_time": "17:30", "sorting": 3},
      {"open_day": "thursday", "open_day_label": "Torsdag", "open_time": "07:30", "close_day": "thursday", "close_day_label": "Torsdag", "close_time": "17:30", "sorting": 4},
      {"open_day": "friday", "open_day_label": "Fredag", "open_time": "07:30", "close_day": "friday", "close_day_label": "Fredag", "close_time": "17:30", "sorting": 5},
      {"open_day": "saturday", "open_day_label": "Lørdag", "open_time": "Lukket", "close_day": "saturday", "close_day_label": "Lørdag", "close_time": "", "sorting": 6},
      {"open_day": "sunday", "open_day_label": "Søndag", "open_time": "Lukket", "close_day": "sunday", "close_day_label": "Søndag", "close_time": "", "sorting": 7}
    ]
  },
  {
    "id": 772,
    "name": "Ford Sakskøbing",
    "store_code": "08800v",
    "email": "selandia@selandia-auto.dk",
    "phone": "54704331",
    "externalDealerSite": "https://ford.autohus.dk/",
    "external_online_servicebooking": "https://ford.autohus.dk/book-service-pedersen-og-nielsen",
    "onlineWorkshopBooking": false,
    "brands": ["ford"],
    "address": {
      "street": "Nystedvej 18",
      "zipcode": "4990 ",
      "city": "Sakskøbing",
      "country": "Danmark",
      "lat": 54.794742,
      "lng": 11.639
    },
    "business": {
      "id": 91,
      "name": "Ford Danmark ",
      "identifier": "62532319"
    },
    "distributor": {
      "id": 313,
      "name": "Selandia Automobiler A/S",
      "identifier": "21274097"
    },
    "category": {
      "id": 3,
      "name": "Workshop",
      "code": "workshop"
    },
    "opening_hours": [
      {"open_day": "monday", "open_day_label": "Mandag", "open_time": "07:00", "close_day": "monday", "close_day_label": "Mandag", "close_time": "17:00", "sorting": 1},
      {"open_day": "tuesday", "open_day_label": "Tirsdag", "open_time": "07:00", "close_day": "tuesday", "close_day_label": "Tirsdag", "close_time": "17:00", "sorting": 2},
      {"open_day": "wednesday", "open_day_label": "Onsdag", "open_time": "07:00", "close_day": "wednesday", "close_day_label": "Onsdag", "close_time": "17:00", "sorting": 3},
      {"open_day": "thursday", "open_day_label": "Torsdag", "open_time": "07:00", "close_day": "thursday", "close_day_label": "Torsdag", "close_time": "17:00", "sorting": 4},
      {"open_day": "friday", "open_day_label": "Fredag", "open_time": "07:00", "close_day": "friday", "close_day_label": "Fredag", "close_time": "17:00", "sorting": 5},
      {"open_day": "saturday", "open_day_label": "Lørdag", "open_time": "Lukket", "close_day": "saturday", "close_day_label": "Lørdag", "close_time": "", "sorting": 6},
      {"open_day": "sunday", "open_day_label": "Søndag", "open_time": "Lukket", "close_day": "sunday", "close_day_label": "Søndag", "close_time": "", "sorting": 7}
    ]
  },
  {
    "id": 778,
    "name": "Ford Skive",
    "store_code": "09500v",
    "email": "booking@grbiler.dk",
    "phone": "97514000",
    "externalDealerSite": "https://ford.gr-biler.dk/",
    "external_online_servicebooking": "https://ford.gr-biler.dk/gr-bilers-skadecenter",
    "onlineWorkshopBooking": false,
    "brands": ["ford"],
    "address": {
      "street": "Katkjærvej 3",
      "zipcode": "7800",
      "city": "Skive",
      "country": "Danmark",
      "lat": 56.567665,
      "lng": 8.999575
    },
    "business": {
      "id": 91,
      "name": "Ford Danmark ",
      "identifier": "62532319"
    },
    "distributor": {
      "id": 342,
      "name": "G.R. Biler, Skive A/S Ford",
      "identifier": "10092752f"
    },
    "category": {
      "id": 3,
      "name": "Workshop",
      "code": "workshop"
    },
    "opening_hours": [
      {"open_day": "monday", "open_day_label": "Mandag", "open_time": "07:00", "close_day": "monday", "close_day_label": "Mandag", "close_time": "17:00", "sorting": 1},
      {"open_day": "tuesday", "open_day_label": "Tirsdag", "open_time": "07:00", "close_day": "tuesday", "close_day_label": "Tirsdag", "close_time": "17:00", "sorting": 2},
      {"open_day": "wednesday", "open_day_label": "Onsdag", "open_time": "07:00", "close_day": "wednesday", "close_day_label": "Onsdag", "close_time": "17:00", "sorting": 3},
      {"open_day": "thursday", "open_day_label": "Torsdag", "open_time": "07:00", "close_day": "thursday", "close_day_label": "Torsdag", "close_time": "17:00", "sorting": 4},
      {"open_day": "friday", "open_day_label": "Fredag", "open_time": "07:00", "close_day": "friday", "close_day_label": "Fredag", "close_time": "16:30", "sorting": 5},
      {"open_day": "saturday", "open_day_label": "Lørdag", "open_time": "Lukket", "close_day": "saturday", "close_day_label": "Lørdag", "close_time": "", "sorting": 6},
      {"open_day": "sunday", "open_day_label": "Søndag", "open_time": "Lukket", "close_day": "sunday", "close_day_label": "Søndag", "close_time": "", "sorting": 7}
    ]
  },
  {
    "id": 716,
    "name": "Ford Slagelse",
    "store_code": "03904v",
    "email": "slagelse@bin2bil.dk",
    "phone": "58551000",
    "externalDealerSite": "https://www.ford.bin2bil.dk/",
    "external_online_servicebooking": "https://www.ford.bin2bil.dk/book-vaerkstedstid-ford-bin2bil",
    "onlineWorkshopBooking": false,
    "brands": ["ford"],
    "address": {
      "street": "Asienvej 3",
      "zipcode": "4200",
      "city": "Slagelse",
      "country": "Danmark",
      "lat": 55.38718,
      "lng": 11.32252
    },
    "business": {
      "id": 91,
      "name": "Ford Danmark ",
      "identifier": "62532319"
    },
    "distributor": {
      "id": 341,
      "name": "Bin2Bil A/S Ford",
      "identifier": "DK25834933"
    },
    "category": {
      "id": 3,
      "name": "Workshop",
      "code": "workshop"
    },
    "opening_hours": [
      {"open_day": "monday", "open_day_label": "Mandag", "open_time": "07:00", "close_day": "monday", "close_day_label": "Mandag", "close_time": "19:00", "sorting": 1},
      {"open_day": "tuesday", "open_day_label": "Tirsdag", "open_time": "07:00", "close_day": "tuesday", "close_day_label": "Tirsdag", "close_time": "19:00", "sorting": 2},
      {"open_day": "wednesday", "open_day_label": "Onsdag", "open_time": "07:00", "close_day": "wednesday", "close_day_label": "Onsdag", "close_time": "19:00", "sorting": 3},
      {"open_day": "thursday", "open_day_label": "Torsdag", "open_time": "07:00", "close_day": "thursday", "close_day_label": "Torsdag", "close_time": "19:00", "sorting": 4},
      {"open_day": "friday", "open_day_label": "Fredag", "open_time": "07:00", "close_day": "friday", "close_day_label": "Fredag", "close_time": "15:00", "sorting": 5},
      {"open_day": "saturday", "open_day_label": "Lørdag", "open_time": "Lukket", "close_day": "saturday", "close_day_label": "Lørdag", "close_time": "", "sorting": 6},
      {"open_day": "sunday", "open_day_label": "Søndag", "open_time": "Lukket", "close_day": "sunday", "close_day_label": "Søndag", "close_time": "", "sorting": 7}
    ]
  },
  {
    "id": 799,
    "name": "Ford Svendborg",
    "store_code": "14800v",
    "email": "vaerksted@nkjaer.dk",
    "phone": "+4562212323",
    "externalDealerSite": "https://ford.nkjaer.dk/",
    "external_online_servicebooking": "https://ford.nkjaer.dk/side/109",
    "onlineWorkshopBooking": false,
    "brands": ["ford"],
    "address": {
      "street": "Odensevej 94",
      "zipcode": "5700",
      "city": "Svendborg",
      "country": "Danmark",
      "lat": 55.072923,
      "lng": 10.582448
    },
    "business": {
      "id": 91,
      "name": "Ford Danmark ",
      "identifier": "62532319"
    },
    "distributor": {
      "id": 323,
      "name": "N.Kjær Bilcentret A/S",
      "identifier": "37016012"
    },
    "category": {
      "id": 3,
      "name": "Workshop",
      "code": "workshop"
    },
    "opening_hours": [
      {"open_day": "monday", "open_day_label": "Mandag", "open_time": "06:45", "close_day": "monday", "close_day_label": "Mandag", "close_time": "18:00", "sorting": 1},
      {"open_day": "tuesday", "open_day_label": "Tirsdag", "open_time": "06:45", "close_day": "tuesday", "close_day_label": "Tirsdag", "close_time": "18:00", "sorting": 2},
      {"open_day": "wednesday", "open_day_label": "Onsdag", "open_time": "06:45", "close_day": "wednesday", "close_day_label": "Onsdag", "close_time": "18:00", "sorting": 3},
      {"open_day": "thursday", "open_day_label": "Torsdag", "open_time": "06:45", "close_day": "thursday", "close_day_label": "Torsdag", "close_time": "18:00", "sorting": 4},
      {"open_day": "friday", "open_day_label": "Fredag", "open_time": "06:45", "close_day": "friday", "close_day_label": "Fredag", "close_time": "16:45", "sorting": 5},
      {"open_day": "saturday", "open_day_label": "Lørdag", "open_time": "Lukket", "close_day": "saturday", "close_day_label": "Lørdag", "close_time": "", "sorting": 6},
      {"open_day": "sunday", "open_day_label": "Søndag", "open_time": "Lukket", "close_day": "sunday", "close_day_label": "Søndag", "close_time": "", "sorting": 7}
    ]
  },
  {
    "id": 769,
    "name": "Ford Sønderborg",
    "store_code": "07531v",
    "email": "service.sonderborg@autohus.dk",
    "phone": "74425155",
    "externalDealerSite": "https://ford.autohus.dk/",
    "external_online_servicebooking": "https://ford.autohus.dk/book-service-pedersen-og-nielsen",
    "onlineWorkshopBooking": false,
    "brands": ["ford"],
    "address": {
      "street": "Ellegårdvej 5",
      "zipcode": "6400",
      "city": "Sønderborg",
      "country": "Danmark",
      "lat": 54.927791,
      "lng": 9.79758
    },
    "business": {
      "id": 91,
      "name": "Ford Danmark ",
      "identifier": "62532319"
    },
    "distributor": {
      "id": 314,
      "name": "Pedersen & Nielsen Automobilfor. A/S",
      "identifier": "14854738"
    },
    "category": {
      "id": 3,
      "name": "Workshop",
      "code": "workshop"
    },
    "opening_hours": [
      {"open_day": "monday", "open_day_label": "Mandag", "open_time": "07:30", "close_day": "monday", "close_day_label": "Mandag", "close_time": "16:00", "sorting": 1},
      {"open_day": "tuesday", "open_day_label": "Tirsdag", "open_time": "07:30", "close_day": "tuesday", "close_day_label": "Tirsdag", "close_time": "16:00", "sorting": 2},
      {"open_day": "wednesday", "open_day_label": "Onsdag", "open_time": "07:30", "close_day": "wednesday", "close_day_label": "Onsdag", "close_time": "16:00", "sorting": 3},
      {"open_day": "thursday", "open_day_label": "Torsdag", "open_time": "07:30", "close_day": "thursday", "close_day_label": "Torsdag", "close_time": "16:00", "sorting": 4},
      {"open_day": "friday", "open_day_label": "Fredag", "open_time": "07:30", "close_day": "friday", "close_day_label": "Fredag", "close_time": "13:00", "sorting": 5},
      {"open_day": "saturday", "open_day_label": "Lørdag", "open_time": "Lukket", "close_day": "saturday", "close_day_label": "Lørdag", "close_time": "", "sorting": 6},
      {"open_day": "sunday", "open_day_label": "Søndag", "open_time": "Lukket", "close_day": "sunday", "close_day_label": "Søndag", "close_time": "", "sorting": 7}
    ]
  },
  {
    "id": 665,
    "name": "Ford Taastrup",
    "store_code": "01108v",
    "email": "vs-taastrup@andersenbiler.dk",
    "phone": "72591700",
    "externalDealerSite": "https://www.andersenbiler-ford.dk/",
    "external_online_servicebooking": "https://www.andersenbiler.dk/book-vaerkstedstid/",
    "onlineWorkshopBooking": false,
    "brands": ["ford"],
    "address": {
      "street": "Husby Alle 7-9",
      "zipcode": "2630",
      "city": "Taastrup",
      "country": "Danmark",
      "lat": 55.6609907,
      "lng": 12.2944217
    },
    "business": {
      "id": 91,
      "name": "Ford Danmark ",
      "identifier": "62532319"
    },
    "distributor": {
      "id": 338,
      "name": "Andersen Biler A/S Ford",
      "identifier": "17694707F"
    },
    "category": {
      "id": 3,
      "name": "Workshop",
      "code": "workshop"
    },
    "opening_hours": [
      {"open_day": "monday", "open_day_label": "Mandag", "open_time": "07:00", "close_day": "monday", "close_day_label": "Mandag", "close_time": "17:00", "sorting": 1},
      {"open_day": "tuesday", "open_day_label": "Tirsdag", "open_time": "07:00", "close_day": "tuesday", "close_day_label": "Tirsdag", "close_time": "17:00", "sorting": 2},
      {"open_day": "wednesday", "open_day_label": "Onsdag", "open_time": "07:00", "close_day": "wednesday", "close_day_label": "Onsdag", "close_time": "17:00", "sorting": 3},
      {"open_day": "thursday", "open_day_label": "Torsdag", "open_time": "07:00", "close_day": "thursday", "close_day_label": "Torsdag", "close_time": "17:00", "sorting": 4},
      {"open_day": "friday", "open_day_label": "Fredag", "open_time": "07:00", "close_day": "friday", "close_day_label": "Fredag", "close_time": "17:00", "sorting": 5},
      {"open_day": "saturday", "open_day_label": "Lørdag", "open_time": "Lukket", "close_day": "saturday", "close_day_label": "Lørdag", "close_time": "", "sorting": 6},
      {"open_day": "sunday", "open_day_label": "Søndag", "open_time": "Lukket", "close_day": "sunday", "close_day_label": "Søndag", "close_time": "", "sorting": 7}
    ]
  },
  {
    "id": 726,
    "name": "Ford Thisted",
    "store_code": "04807v",
    "email": "thisted@hessel.dk",
    "phone": "72116900",
    "externalDealerSite": "https://ford.hessel.dk/",
    "external_online_servicebooking": "https://www.hessel.dk/vaerksted-service/booking?step=1",
    "onlineWorkshopBooking": false,
    "brands": ["ford"],
    "address": {
      "street": "Løvevej 17",
      "zipcode": "7700",
      "city": "Thisted",
      "country": "Danmark",
      "lat": 56.967967,
      "lng": 8.735965
    },
    "business": {
      "id": 91,
      "name": "Ford Danmark ",
      "identifier": "62532319"
    },
    "distributor": {
      "id": 309,
      "name": "Ejner Hessel A/S",
      "identifier": "58811211"
    },
    "category": {
      "id": 3,
      "name": "Workshop",
      "code": "workshop"
    },
    "opening_hours": [
      {"open_day": "monday", "open_day_label": "Mandag", "open_time": "07:00", "close_day": "monday", "close_day_label": "Mandag", "close_time": "17:00", "sorting": 1},
      {"open_day": "tuesday", "open_day_label": "Tirsdag", "open_time": "07:00", "close_day": "tuesday", "close_day_label": "Tirsdag", "close_time": "17:00", "sorting": 2},
      {"open_day": "wednesday", "open_day_label": "Onsdag", "open_time": "07:00", "close_day": "wednesday", "close_day_label": "Onsdag", "close_time": "17:00", "sorting": 3},
      {"open_day": "thursday", "open_day_label": "Torsdag", "open_time": "07:00", "close_day": "thursday", "close_day_label": "Torsdag", "close_time": "17:00", "sorting": 4},
      {"open_day": "friday", "open_day_label": "Fredag", "open_time": "07:00", "close_day": "friday", "close_day_label": "Fredag", "close_time": "17:00", "sorting": 5},
      {"open_day": "saturday", "open_day_label": "Lørdag", "open_time": "Lukket", "close_day": "saturday", "close_day_label": "Lørdag", "close_time": "", "sorting": 6},
      {"open_day": "sunday", "open_day_label": "Søndag", "open_time": "Lukket", "close_day": "sunday", "close_day_label": "Søndag", "close_time": "", "sorting": 7}
    ]
  },
  {
    "id": 723,
    "name": "Ford Valby",
    "store_code": "04805v",
    "email": "valby@hessel.dk",
    "phone": "73125600",
    "externalDealerSite": "https://ford.hessel.dk/",
    "external_online_servicebooking": "https://www.hessel.dk/vaerksted-service/booking?step=1",
    "onlineWorkshopBooking": false,
    "brands": ["ford"],
    "address": {
      "street": "Gl. Køge Landevej 135",
      "zipcode": "2500",
      "city": "Valby",
      "country": "Danmark",
      "lat": 55.64514,
      "lng": 12.50392
    },
    "business": {
      "id": 91,
      "name": "Ford Danmark ",
      "identifier": "62532319"
    },
    "distributor": {
      "id": 309,
      "name": "Ejner Hessel A/S",
      "identifier": "58811211"
    },
    "category": {
      "id": 3,
      "name": "Workshop",
      "code": "workshop"
    },
    "opening_hours": [
      {"open_day": "monday", "open_day_label": "Mandag", "open_time": "06:30", "close_day": "monday", "close_day_label": "Mandag", "close_time": "17:30", "sorting": 1},
      {"open_day": "tuesday", "open_day_label": "Tirsdag", "open_time": "06:30", "close_day": "tuesday", "close_day_label": "Tirsdag", "close_time": "17:30", "sorting": 2},
      {"open_day": "wednesday", "open_day_label": "Onsdag", "open_time": "06:30", "close_day": "wednesday", "close_day_label": "Onsdag", "close_time": "17:30", "sorting": 3},
      {"open_day": "thursday", "open_day_label": "Torsdag", "open_time": "06:30", "close_day": "thursday", "close_day_label": "Torsdag", "close_time": "17:30", "sorting": 4},
      {"open_day": "friday", "open_day_label": "Fredag", "open_time": "06:30", "close_day": "friday", "close_day_label": "Fredag", "close_time": "17:30", "sorting": 5},
      {"open_day": "saturday", "open_day_label": "Lørdag", "open_time": "Lukket", "close_day": "saturday", "close_day_label": "Lørdag", "close_time": "", "sorting": 6},
      {"open_day": "sunday", "open_day_label": "Søndag", "open_time": "Lukket", "close_day": "sunday", "close_day_label": "Søndag", "close_time": "", "sorting": 7}
    ]
  },
  {
    "id": 745,
    "name": "Ford Kolding",
    "store_code": "07304v",
    "email": "salgpv@autohuset-vestergaard.dk",
    "phone": "75522555",
    "lms": "aa1a4297-4ad2-4276-a903-a7511cdd7a2b",
    "externalDealerSite": "https://ford.autohuset-vestergaard.dk/",
    "external_online_servicebooking": "https://ford.autohuset-vestergaard.dk/autohuset-vestergaard-bestil-service",
    "onlineWorkshopBooking": false,
    "brands": ["ford"],
    "address": {
      "street": "Trianglen 4",
      "zipcode": "6000",
      "city": "Kolding",
      "country": "Danmark",
      "lat": 55.532118,
      "lng": 9.462606
    },
    "business": {
      "id": 91,
      "name": "Ford Danmark ",
      "identifier": "62532319"
    },
    "distributor": {
      "id": 312,
      "name": "Autohuset Vestergaard A/S",
      "identifier": "18930579"
    },
    "category": {
      "id": 3,
      "name": "Workshop",
      "code": "workshop"
    },
    "opening_hours": [
      {"open_day": "monday", "open_day_label": "Mandag", "open_time": "07:30", "close_day": "monday", "close_day_label": "Mandag", "close_time": "17:30", "sorting": 1},
      {"open_day": "tuesday", "open_day_label": "Tirsdag", "open_time": "07:30", "close_day": "tuesday", "close_day_label": "Tirsdag", "close_time": "17:30", "sorting": 2},
      {"open_day": "wednesday", "open_day_label": "Onsdag", "open_time": "07:30", "close_day": "wednesday", "close_day_label": "Onsdag", "close_time": "17:30", "sorting": 3},
      {"open_day": "thursday", "open_day_label": "Torsdag", "open_time": "07:30", "close_day": "thursday", "close_day_label": "Torsdag", "close_time": "17:30", "sorting": 4},
      {"open_day": "friday", "open_day_label": "Fredag", "open_time": "07:30", "close_day": "friday", "close_day_label": "Fredag", "close_time": "17:30", "sorting": 5},
      {"open_day": "saturday", "open_day_label": "Lørdag", "open_time": "Lukket", "close_day": "saturday", "close_day_label": "Lørdag", "close_time": "", "sorting": 6},
      {"open_day": "sunday", "open_day_label": "Søndag", "open_time": "Lukket", "close_day": "sunday", "close_day_label": "Søndag", "close_time": "", "sorting": 7}
    ]
  },
  {
    "id": 659,
    "name": "Ford København N",
    "store_code": "01105v",
    "email": "vs-r78@andersenbiler.dk",
    "phone": "88775555",
    "externalDealerSite": "https://www.andersenbiler-ford.dk/",
    "external_online_servicebooking": "https://www.andersenbiler.dk/book-vaerkstedstid/",
    "onlineWorkshopBooking": false,
    "brands": ["ford"],
    "address": {
      "street": "Rovsingsgade 78",
      "zipcode": "2200",
      "city": "København N",
      "country": "Danmark",
      "lat": 55.707869,
      "lng": 12.548469
    },
    "business": {
      "id": 91,
      "name": "Ford Danmark ",
      "identifier": "62532319"
    },
    "distributor": {
      "id": 338,
      "name": "Andersen Biler A/S Ford",
      "identifier": "17694707F"
    },
    "category": {
      "id": 3,
      "name": "Workshop",
      "code": "workshop"
    },
    "opening_hours": [
      {"open_day": "monday", "open_day_label": "Mandag", "open_time": "07:00", "close_day": "monday", "close_day_label": "Mandag", "close_time": "17:00", "sorting": 1},
      {"open_day": "tuesday", "open_day_label": "Tirsdag", "open_time": "07:00", "close_day": "tuesday", "close_day_label": "Tirsdag", "close_time": "17:00", "sorting": 2},
      {"open_day": "wednesday", "open_day_label": "Onsdag", "open_time": "07:00", "close_day": "wednesday", "close_day_label": "Onsdag", "close_time": "17:00", "sorting": 3},
      {"open_day": "thursday", "open_day_label": "Torsdag", "open_time": "07:00", "close_day": "thursday", "close_day_label": "Torsdag", "close_time": "17:00", "sorting": 4},
      {"open_day": "friday", "open_day_label": "Fredag", "open_time": "06:30", "close_day": "friday", "close_day_label": "Fredag", "close_time": "16:30", "sorting": 5},
      {"open_day": "saturday", "open_day_label": "Lørdag", "open_time": "Lukket", "close_day": "saturday", "close_day_label": "Lørdag", "close_time": "", "sorting": 6},
      {"open_day": "sunday", "open_day_label": "Søndag", "open_time": "Lukket", "close_day": "sunday", "close_day_label": "Søndag", "close_time": "", "sorting": 7}
    ]
  },
  {
    "id": 685,
    "name": "Ford Køge",
    "store_code": "02112v",
    "email": "koge@bn.dk",
    "phone": "56677000",
    "externalDealerSite": "https://ford.bn.dk/",
    "external_online_servicebooking": "https://ford.bn.dk/online-service-booking-ford-bjarne-nielsen",
    "onlineWorkshopBooking": false,
    "brands": ["ford"],
    "address": {
      "street": "Tangmosevej 108",
      "zipcode": "4600",
      "city": "Køge",
      "country": "Danmark",
      "lat": 55.474476,
      "lng": 12.185638
    },
    "business": {
      "id": 91,
      "name": "Ford Danmark ",
      "identifier": "62532319"
    },
    "distributor": {
      "id": 302,
      "name": "Bjarne Nielsen A/S",
      "identifier": "31943140"
    },
    "category": {
      "id": 3,
      "name": "Workshop",
      "code": "workshop"
    },
    "opening_hours": [
      {"open_day": "monday", "open_day_label": "Mandag", "open_time": "06:00", "close_day": "monday", "close_day_label": "Mandag", "close_time": "17:00", "sorting": 1},
      {"open_day": "tuesday", "open_day_label": "Tirsdag", "open_time": "06:00", "close_day": "tuesday", "close_day_label": "Tirsdag", "close_time": "17:00", "sorting": 2},
      {"open_day": "wednesday", "open_day_label": "Onsdag", "open_time": "06:00", "close_day": "wednesday", "close_day_label": "Onsdag", "close_time": "17:00", "sorting": 3},
      {"open_day": "thursday", "open_day_label": "Torsdag", "open_time": "06:00", "close_day": "thursday", "close_day_label": "Torsdag", "close_time": "17:00", "sorting": 4},
      {"open_day": "friday", "open_day_label": "Fredag", "open_time": "06:00", "close_day": "friday", "close_day_label": "Fredag", "close_time": "15:00", "sorting": 5},
      {"open_day": "saturday", "open_day_label": "Lørdag", "open_time": "Lukket", "close_day": "saturday", "close_day_label": "Lørdag", "close_time": "", "sorting": 6},
      {"open_day": "sunday", "open_day_label": "Søndag", "open_time": "Lukket", "close_day": "sunday", "close_day_label": "Søndag", "close_time": "", "sorting": 7}
    ]
  },
  {
    "id": 769,
    "name": "Ford Vejen",
    "store_code": "11500v",
    "email": "post@lkj.dk",
    "phone": "76963333",
    "externalDealerSite": "https://ford.lkj.dk/",
    "external_online_servicebooking": "https://ford.lkj.dk/bestil-autoriseret-ford-service-vejen",
    "onlineWorkshopBooking": false,
    "brands": ["ford"],
    "address": {
      "street": "Dalgas Allé 6",
      "zipcode": "6600",
      "city": "Vejen",
      "country": "Danmark",
      "lat": 55.466852,
      "lng": 9.14155
    },
    "business": {
      "id": 91,
      "name": "Ford Danmark ",
      "identifier": "62532319"
    },
    "distributor": {
      "id": 318,
      "name": "LKJ Biler Vejen A/S",
      "identifier": "19326772"
    },
    "category": {
      "id": 3,
      "name": "Workshop",
      "code": "workshop"
    },
    "opening_hours": [
      {"open_day": "monday", "open_day_label": "Mandag", "open_time": "06:00", "close_day": "monday", "close_day_label": "Mandag", "close_time": "17:00", "sorting": 1},
      {"open_day": "tuesday", "open_day_label": "Tirsdag", "open_time": "06:00", "close_day": "tuesday", "close_day_label": "Tirsdag", "close_time": "17:00", "sorting": 2},
      {"open_day": "wednesday", "open_day_label": "Onsdag", "open_time": "06:00", "close_day": "wednesday", "close_day_label": "Onsdag", "close_time": "17:00", "sorting": 3},
      {"open_day": "thursday", "open_day_label": "Torsdag", "open_time": "06:00", "close_day": "thursday", "close_day_label": "Torsdag", "close_time": "17:00", "sorting": 4},
      {"open_day": "friday", "open_day_label": "Fredag", "open_time": "06:00", "close_day": "friday", "close_day_label": "Fredag", "close_time": "17:00", "sorting": 5},
      {"open_day": "saturday", "open_day_label": "Lørdag", "open_time": "Lukket", "close_day": "saturday", "close_day_label": "Lørdag", "close_time": "", "sorting": 6},
      {"open_day": "sunday", "open_day_label": "Søndag", "open_time": "Lukket", "close_day": "sunday", "close_day_label": "Søndag", "close_time": "", "sorting": 7}
    ]
  },
  {
    "id": 784,
    "name": "Ford Vejle ",
    "store_code": "11700v",
    "email": "mail@bbvejle.dk",
    "phone": "75826000",
    "externalDealerSite": "https://www.ford-bbvejle.dk/",
    "external_online_servicebooking": "https://www.ford-bbvejle.dk/side/122",
    "onlineWorkshopBooking": false,
    "brands": ["ford"],
    "address": {
      "street": "Boulevarden 58",
      "zipcode": "7100",
      "city": "Vejle",
      "country": "Danmark",
      "lat": 55.708878,
      "lng": 9.522206
    },
    "business": {
      "id": 91,
      "name": "Ford Danmark ",
      "identifier": "62532319"
    },
    "distributor": {
      "id": 319,
      "name": "Bøje & Brøchner A/S",
      "identifier": "27763251"
    },
    "category": {
      "id": 3,
      "name": "Workshop",
      "code": "workshop"
    },
    "opening_hours": [
      {"open_day": "monday", "open_day_label": "Mandag", "open_time": "06:00", "close_day": "monday", "close_day_label": "Mandag", "close_time": "17:30", "sorting": 1},
      {"open_day": "tuesday", "open_day_label": "Tirsdag", "open_time": "06:00", "close_day": "tuesday", "close_day_label": "Tirsdag", "close_time": "17:30", "sorting": 2},
      {"open_day": "wednesday", "open_day_label": "Onsdag", "open_time": "06:00", "close_day": "wednesday", "close_day_label": "Onsdag", "close_time": "17:30", "sorting": 3},
      {"open_day": "thursday", "open_day_label": "Torsdag", "open_time": "06:00", "close_day": "thursday", "close_day_label": "Torsdag", "close_time": "17:30", "sorting": 4},
      {"open_day": "friday", "open_day_label": "Fredag", "open_time": "06:00", "close_day": "friday", "close_day_label": "Fredag", "close_time": "17:30", "sorting": 5},
      {"open_day": "saturday", "open_day_label": "Lørdag", "open_time": "Lukket", "close_day": "saturday", "close_day_label": "Lørdag", "close_time": "", "sorting": 6},
      {"open_day": "sunday", "open_day_label": "Søndag", "open_time": "Lukket", "close_day": "sunday", "close_day_label": "Søndag", "close_time": "", "sorting": 7}
    ]
  },
  {
    "id": 823,
    "name": "Ford Viborg",
    "store_code": "17800v",
    "email": "ts@jorgenolsen.dk",
    "phone": "86623222",
    "externalDealerSite": "https://ford.jorgenolsen.dk/",
    "external_online_servicebooking": "https://ford.jorgenolsen.dk/side/110",
    "onlineWorkshopBooking": false,
    "brands": ["ford"],
    "address": {
      "street": "Industrivej 16",
      "zipcode": "8800",
      "city": "Viborg",
      "country": "Danmark",
      "lat": 56.465598,
      "lng": 9.406737
    },
    "business": {
      "id": 91,
      "name": "Ford Danmark ",
      "identifier": "62532319"
    },
    "distributor": {
      "id": 343,
      "name": "Jørgen Olsen Automobiler A/S Ford",
      "identifier": "25813510f"
    },
    "category": {
      "id": 3,
      "name": "Workshop",
      "code": "workshop"
    },
    "opening_hours": [
      {"open_day": "monday", "open_day_label": "Mandag", "open_time": "06:45", "close_day": "monday", "close_day_label": "Mandag", "close_time": "17:00", "sorting": 1},
      {"open_day": "tuesday", "open_day_label": "Tirsdag", "open_time": "06:45", "close_day": "tuesday", "close_day_label": "Tirsdag", "close_time": "17:00", "sorting": 2},
      {"open_day": "wednesday", "open_day_label": "Onsdag", "open_time": "06:45", "close_day": "wednesday", "close_day_label": "Onsdag", "close_time": "17:00", "sorting": 3},
      {"open_day": "thursday", "open_day_label": "Torsdag", "open_time": "06:45", "close_day": "thursday", "close_day_label": "Torsdag", "close_time": "17:00", "sorting": 4},
      {"open_day": "friday", "open_day_label": "Fredag", "open_time": "06:45", "close_day": "friday", "close_day_label": "Fredag", "close_time": "16:00", "sorting": 5},
      {"open_day": "saturday", "open_day_label": "Lørdag", "open_time": "Lukket", "close_day": "saturday", "close_day_label": "Lørdag", "close_time": "", "sorting": 6},
      {"open_day": "sunday", "open_day_label": "Søndag", "open_time": "Lukket", "close_day": "sunday", "close_day_label": "Søndag", "close_time": "", "sorting": 7}
    ]
  },
  {
    "id": 820,
    "name": "Ford Viby",
    "store_code": "26000v",
    "email": "kundecenter@nellemann.dk",
    "phone": "86282822",
    "externalDealerSite": "https://www.ford-nellemann.dk/",
    "external_online_servicebooking": "https://www.ford-nellemann.dk/side/119/book-service-online-nellemann",
    "onlineWorkshopBooking": false,
    "brands": ["ford"],
    "address": {
      "street": "Jens Juuls Vej 14",
      "zipcode": "8260",
      "city": "Viby",
      "country": "Danmark",
      "lat": 56.113645,
      "lng": 10.133081
    },
    "business": {
      "id": 91,
      "name": "Ford Danmark ",
      "identifier": "62532319"
    },
    "distributor": {
      "id": 336,
      "name": "Nellemann A/S",
      "identifier": "18036800"
    },
    "category": {
      "id": 3,
      "name": "Workshop",
      "code": "workshop"
    },
    "opening_hours": [
      {"open_day": "monday", "open_day_label": "Mandag", "open_time": "07:00", "close_day": "monday", "close_day_label": "Mandag", "close_time": "17:00", "sorting": 1},
      {"open_day": "tuesday", "open_day_label": "Tirsdag", "open_time": "07:00", "close_day": "tuesday", "close_day_label": "Tirsdag", "close_time": "17:00", "sorting": 2},
      {"open_day": "wednesday", "open_day_label": "Onsdag", "open_time": "07:00", "close_day": "wednesday", "close_day_label": "Onsdag", "close_time": "17:00", "sorting": 3},
      {"open_day": "thursday", "open_day_label": "Torsdag", "open_time": "07:00", "close_day": "thursday", "close_day_label": "Torsdag", "close_time": "17:00", "sorting": 4},
      {"open_day": "friday", "open_day_label": "Fredag", "open_time": "07:00", "close_day": "friday", "close_day_label": "Fredag", "close_time": "17:00", "sorting": 5},
      {"open_day": "saturday", "open_day_label": "Lørdag", "open_time": "Lukket", "close_day": "saturday", "close_day_label": "Lørdag", "close_time": "", "sorting": 6},
      {"open_day": "sunday", "open_day_label": "Søndag", "open_time": "Lukket", "close_day": "sunday", "close_day_label": "Søndag", "close_time": "", "sorting": 7}
    ]
  },
  {
    "id": 790,
    "name": "Ford Vissenbjerg",
    "store_code": "11800v",
    "email": "thybo@bilhusetthybo.dk",
    "phone": "64471165",
    "externalDealerSite": "https://www.ford-bilhusetthybo.dk/",
    "external_online_servicebooking": "https://www.ford-bilhusetthybo.dk/side/138",
    "onlineWorkshopBooking": false,
    "brands": ["ford"],
    "address": {
      "street": "Bredgade 74",
      "zipcode": "5492",
      "city": "Vissenbjerg",
      "country": "Danmark",
      "lat": 55.379346,
      "lng": 10.102285
    },
    "business": {
      "id": 91,
      "name": "Ford Danmark ",
      "identifier": "62532319"
    },
    "distributor": {
      "id": 320,
      "name": "Bilhuset Thybo A/S",
      "identifier": "87408817"
    },
    "category": {
      "id": 3,
      "name": "Workshop",
      "code": "workshop"
    },
    "opening_hours": [
      {"open_day": "monday", "open_day_label": "Mandag", "open_time": "06:30", "close_day": "monday", "close_day_label": "Mandag", "close_time": "17:00", "sorting": 1},
      {"open_day": "tuesday", "open_day_label": "Tirsdag", "open_time": "06:30", "close_day": "tuesday", "close_day_label": "Tirsdag", "close_time": "17:00", "sorting": 2},
      {"open_day": "wednesday", "open_day_label": "Onsdag", "open_time": "06:30", "close_day": "wednesday", "close_day_label": "Onsdag", "close_time": "17:00", "sorting": 3},
      {"open_day": "thursday", "open_day_label": "Torsdag", "open_time": "06:30", "close_day": "thursday", "close_day_label": "Torsdag", "close_time": "17:00", "sorting": 4},
      {"open_day": "friday", "open_day_label": "Fredag", "open_time": "06:30", "close_day": "friday", "close_day_label": "Fredag", "close_time": "17:00", "sorting": 5},
      {"open_day": "saturday", "open_day_label": "Lørdag", "open_time": "Lukket", "close_day": "saturday", "close_day_label": "Lørdag", "close_time": "", "sorting": 6},
      {"open_day": "sunday", "open_day_label": "Søndag", "open_time": "Lukket", "close_day": "sunday", "close_day_label": "Søndag", "close_time": "", "sorting": 7}
    ]
  },
  {
    "id": 793,
    "name": "Ford Vordingborg",
    "store_code": "12000v",
    "email": "info@tsc-biler.dk",
    "phone": "55345038",
    "externalDealerSite": "https://www.ford-vordingborg.dk/",
    "external_online_servicebooking": "https://www.ford-vordingborg.dk/kontakt/formularer/book-service",
    "onlineWorkshopBooking": false,
    "brands": ["ford"],
    "address": {
      "street": "Næstvedvej 64",
      "zipcode": "4760",
      "city": "Vordingborg",
      "country": "Danmark",
      "lat": 55.023861,
      "lng": 11.888127
    },
    "business": {
      "id": 91,
      "name": "Ford Danmark ",
      "identifier": "62532319"
    },
    "distributor": {
      "id": 321,
      "name": "Tommy Skovhus Christensen A/S",
      "identifier": "25574397"
    },
    "category": {
      "id": 3,
      "name": "Workshop",
      "code": "workshop"
    },
    "opening_hours": [
      {"open_day": "monday", "open_day_label": "Mandag", "open_time": "07:30", "close_day": "monday", "close_day_label": "Mandag", "close_time": "15:30", "sorting": 1},
      {"open_day": "tuesday", "open_day_label": "Tirsdag", "open_time": "07:30", "close_day": "tuesday", "close_day_label": "Tirsdag", "close_time": "15:30", "sorting": 2},
      {"open_day": "wednesday", "open_day_label": "Onsdag", "open_time": "07:30", "close_day": "wednesday", "close_day_label": "Onsdag", "close_time": "15:30", "sorting": 3},
      {"open_day": "thursday", "open_day_label": "Torsdag", "open_time": "07:30", "close_day": "thursday", "close_day_label": "Torsdag", "close_time": "15:30", "sorting": 4},
      {"open_day": "friday", "open_day_label": "Fredag", "open_time": "07:30", "close_day": "friday", "close_day_label": "Fredag", "close_time": "15:00", "sorting": 5},
      {"open_day": "saturday", "open_day_label": "Lørdag", "open_time": "Lukket", "close_day": "saturday", "close_day_label": "Lørdag", "close_time": "", "sorting": 6},
      {"open_day": "sunday", "open_day_label": "Søndag", "open_time": "Lukket", "close_day": "sunday", "close_day_label": "Søndag", "close_time": "", "sorting": 7}
    ]
  }
];

/***************************************************
 * Leaflet-kort
 ***************************************************/
var map = L.map('map', {
  center: [56, 10],
  zoom: 7,
  zoomControl: false
});

// (A) WMS-lag for Redningsnummer via geoserver
var redningsnrLayer = L.tileLayer.wms("https://kort.strandnr.dk/geoserver/nobc/ows", {
  layers: "Redningsnummer",
  format: "image/png",
  transparent: true,
  version: "1.3.0",
  attribution: "Data: redningsnummer.dk"
});

// OpenStreetMap-lag
var osmLayer = L.tileLayer(
  'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
  {
    maxZoom: 19,
    attribution: "© OpenStreetMap contributors, © Styrelsen for Dataforsyning og Infrastruktur"
  }
).addTo(map);

// Opret base-lag (baggrundskort)
const baseMaps = {
  "OpenStreetMap": osmLayer
};

// Opret overlay-lag
var fordLayer = L.layerGroup();  // NY: Layer til Ford værksteder
const overlayMaps = {
  "Strandposter": redningsnrLayer,
  "Ford": fordLayer         // Tilføjet i lagvælgeren
};

// Tilføj lagvælgeren
L.control.layers(baseMaps, overlayMaps, { position: 'topright' }).addTo(map);
L.control.zoom({ position: 'bottomright' }).addTo(map);

var currentMarker;

/***************************************************
 * Kommunedata hentet fra "Kommuner.xlsx"
 ***************************************************/
const kommuneInfo = {
  "Herning": { "Døde dyr": "Nej", "Gader og veje": "Nej" },
  "Vejle":   { "Døde dyr": "Ja",  "Gader og veje": "Ja" },
  "Vejen":   { "Døde dyr": "Ja",  "Gader og veje": "Ja" }
};

/***************************************************
 * Klik på kort => reverse geocoding (Dataforsyningen)
 ***************************************************/
map.on('click', function(e) {
  var lat = e.latlng.lat;
  var lon = e.latlng.lng;

  if (currentMarker) {
    map.removeLayer(currentMarker);
  }
  currentMarker = L.marker([lat, lon]).addTo(map);

  // Opdater koordinatboksen
  document.getElementById("coordinateBox").textContent =
    `Koordinater: ${lat.toFixed(6)}, ${lon.toFixed(6)}`;
  document.getElementById("coordinateBox").style.display = "block";

  // Reverse geocoding mod Dataforsyningen
  let revUrl = `https://api.dataforsyningen.dk/adgangsadresser/reverse?x=${lon}&y=${lat}&struktur=flad`;
  console.log("Kalder reverse geocoding:", revUrl);
  fetch(revUrl)
    .then(r => r.json())
    .then(data => {
      updateInfoBox(data, lat, lon);
    })
    .catch(err => console.error("Reverse geocoding fejl:", err));
});

/***************************************************
 * Opdatering af info boks
 ***************************************************/
async function updateInfoBox(data, lat, lon) {
  const streetviewLink = document.getElementById("streetviewLink");
  const addressEl      = document.getElementById("address");
  const extraInfoEl    = document.getElementById("extra-info");
  const skråfotoLink   = document.getElementById("skraafotoLink");

  const adresseStr = `${data.vejnavn || "?"} ${data.husnr || ""}, ${data.postnr || "?"} ${data.postnrnavn || ""}`;
  const ekstraInfoStr = `Kommunekode: ${data.kommunekode || "?"} | Vejkode: ${data.vejkode || "?"}`;

  streetviewLink.href = `https://www.google.com/maps?q=&layer=c&cbll=${lat},${lon}`;
  addressEl.textContent = adresseStr;

  if (extraInfoEl) {
    extraInfoEl.textContent = ekstraInfoStr;
  }

  // Opdater Skråfoto-linket
  let eastNorth = convertToWGS84(lat, lon);
  skråfotoLink.href = `https://skraafoto.dataforsyningen.dk/?search=${encodeURIComponent(adresseStr)}`;
  skråfotoLink.style.display = "block";

  // Tilføj links til at kopiere adressen i to formater (NYT)
  if (extraInfoEl) {
    let evaFormat = `${data.vejnavn || ""},${data.husnr || ""},${data.postnr || ""}`;
    let notesFormat = `${data.vejnavn || ""} ${data.husnr || ""}\\n${data.postnr || ""} ${data.postnrnavn || ""}`;

    extraInfoEl.innerHTML += `
      <br>
      <a href="#" onclick="copyToClipboard('${evaFormat}');return false;">Eva.Net</a> |
      <a href="#" onclick="copyToClipboard('${notesFormat}');return false;">Notes</a>
    `;
  }

  // Ryd tidligere søgeresultater
  if (resultsList) resultsList.innerHTML = "";
  if (vej1List) vej1List.innerHTML = "";
  if (vej2List) vej2List.innerHTML = "";

  // Vent på statsvejsdata
  let statsvejData = await checkForStatsvej(lat, lon);
  const statsvejInfoEl = document.getElementById("statsvejInfo");

  if (statsvejData) {
    statsvejInfoEl.innerHTML = `
      <strong>Administrativt nummer:</strong> ${statsvejData.ADM_NR || "Ukendt"}<br>
      <strong>Forgrening:</strong> ${statsvejData.FORGRENING || "Ukendt"}<br>
      <strong>Vejnavn:</strong> ${statsvejData.BETEGNELSE || "Ukendt"}<br>
      <strong>Bestyrer:</strong> ${statsvejData.BESTYRER || "Ukendt"}<br>
      <strong>Vejtype:</strong> ${statsvejData.VEJTYPE || "Ukendt"}
    `;
    document.getElementById("statsvejInfoBox").style.display = "block";
  } else {
    statsvejInfoEl.innerHTML = "";
    document.getElementById("statsvejInfoBox").style.display = "none";
  }

  document.getElementById("infoBox").style.display = "block";

  // Hent kommuneinfo
  if (data.kommunekode) {
    try {
      let komUrl = `https://api.dataforsyningen.dk/kommuner/${data.kommunekode}`;
      let komResp = await fetch(komUrl);
      if (komResp.ok) {
        let komData = await komResp.json();
        let kommunenavn = komData.navn || "";
        if (kommunenavn && kommuneInfo[kommunenavn]) {
          let info = kommuneInfo[kommunenavn];
          let doedeDyr = info["Døde dyr"];
          let gaderVeje = info["Gader og veje"];
          extraInfoEl.innerHTML += `<br>Kommune: ${kommunenavn} | Døde dyr: ${doedeDyr} | Gader og veje: ${gaderVeje}`;
        }
      }
    } catch (e) {
      console.error("Kunne ikke hente kommuneinfo:", e);
    }
  }
}

/***************************************************
 * Søgefelter, lister
 ***************************************************/
var searchInput  = document.getElementById("search");
var clearBtn     = document.getElementById("clearSearch");
var resultsList  = document.getElementById("results");

var vej1Input    = document.getElementById("vej1");
var vej2Input    = document.getElementById("vej2");
var vej1List     = document.getElementById("results-vej1");
var vej2List     = document.getElementById("results-vej2");

// Tilføj clear-knap til input
function addClearButton(inputElement, listElement) {
  let clearBtn = document.createElement("span");
  clearBtn.innerHTML = "&times;";
  clearBtn.classList.add("clear-button");
  inputElement.parentElement.appendChild(clearBtn);

  inputElement.addEventListener("input", function () {
    clearBtn.style.display = inputElement.value.length > 0 ? "inline" : "none";
  });

  clearBtn.addEventListener("click", function () {
    inputElement.value = "";
    listElement.innerHTML = "";
    clearBtn.style.display = "none";
  });

  inputElement.addEventListener("keydown", function (e) {
    if (e.key === "Backspace" && inputElement.value.length === 0) {
      listElement.innerHTML = "";
    }
  });

  clearBtn.style.display = "none";
}

addClearButton(vej1Input, vej1List);
addClearButton(vej2Input, vej2List);

// Piletaster i #search
var items = [];
var currentIndex = -1;

/***************************************************
 * #search => doSearch
 ***************************************************/
searchInput.addEventListener("input", function() {
  const txt = searchInput.value.trim();
  if (txt.length < 2) {
    clearBtn.style.display = "none";
    resultsList.innerHTML = "";
    document.getElementById("infoBox").style.display = "none";
    return;
  }
  clearBtn.style.display = "inline";
  doSearch(txt, resultsList);

  // Tjek om brugeren har tastet koordinater
  const coordRegex = /^(-?\d+(?:\.\d+))\s*,\s*(-?\d+(?:\.\d+))$/;
  if (coordRegex.test(txt)) {
    const match = txt.match(coordRegex);
    const latNum = parseFloat(match[1]);
    const lonNum = parseFloat(match[2]);
    let revUrl = `https://api.dataforsyningen.dk/adgangsadresser/reverse?x=${lonNum}&y=${latNum}&struktur=flad`;
    fetch(revUrl)
      .then(r => r.json())
      .then(data => {
        resultsList.innerHTML = "";
        placeMarkerAndZoom([latNum, lonNum], `Koordinater: ${latNum.toFixed(5)}, ${lonNum.toFixed(5)}`);
        updateInfoBox(data, latNum, lonNum);
      })
      .catch(err => console.error("Reverse geocoding fejl:", err));
    return;
  }
});

searchInput.addEventListener("keydown", function(e) {
  if (e.key === "Backspace") {
    document.getElementById("infoBox").style.display = "none";
    document.getElementById("coordinateBox").style.display = "none";
  }
});

vej1Input.addEventListener("keydown", function(e) {
  if (e.key === "Backspace") {
    document.getElementById("infoBox").style.display = "none";
  }
});

vej2Input.addEventListener("keydown", function() {
  document.getElementById("infoBox").style.display = "none";
});

// Piletaster i #search
searchInput.addEventListener("keydown", function(e) {
  if (items.length === 0) return;

  if (e.key === "ArrowDown") {
    e.preventDefault();
    currentIndex = (currentIndex + 1) % items.length;
    highlightItem();
  } else if (e.key === "ArrowUp") {
    e.preventDefault();
    currentIndex = (currentIndex + items.length - 1) % items.length;
    highlightItem();
  } else if (e.key === "Enter") {
    e.preventDefault();
    if (currentIndex >= 0) {
      items[currentIndex].click();
    }
  }
});

function highlightItem() {
  items.forEach(li => li.classList.remove("highlight"));
  if (currentIndex >= 0 && currentIndex < items.length) {
    items[currentIndex].classList.add("highlight");
  }
}

/***************************************************
 * Klik på kryds => ryd
 ***************************************************/
clearBtn.addEventListener("click", function() {
  searchInput.value = "";
  resultsList.innerHTML = "";
  clearBtn.style.display = "none";
  document.getElementById("infoBox").style.display = "none";
  document.getElementById("statsvejInfoBox").style.display = "none";
  document.getElementById("coordinateBox").style.display = "none";

  // Sæt fokus på søgefeltet
  searchInput.focus();
});

function resetInfoBox() {
  document.getElementById("extra-info").textContent = "";
  document.getElementById("skraafotoLink").style.display = "none";
}

searchInput.addEventListener("keydown", function(e) {
  if (e.key === "Backspace" && searchInput.value.length === 0) {
    resetInfoBox();
  }
});

clearBtn.addEventListener("click", function() {
  resetInfoBox();
});

vej1Input.parentElement.querySelector(".clear-button").addEventListener("click", function() {
  vej1Input.value = "";
  vej1List.innerHTML = "";
  document.getElementById("infoBox").style.display = "none";
});

vej2Input.parentElement.querySelector(".clear-button").addEventListener("click", function() {
  vej2Input.value = "";
  vej2List.innerHTML = "";
  document.getElementById("infoBox").style.display = "none";
});

/***************************************************
 * Globale variabler til at gemme valgte veje
 ***************************************************/
var selectedRoad1 = null;
var selectedRoad2 = null;

/***************************************************
 * vej1 => doSearchRoad
 ***************************************************/
vej1Input.addEventListener("input", function() {
  const txt = vej1Input.value.trim();
  if (txt.length < 2) {
    vej1List.innerHTML = "";
    vej1List.style.display = "none";
    return;
  }
  doSearchRoad(txt, vej1List, vej1Input);
});

/***************************************************
 * vej2 => doSearchRoad
 ***************************************************/
vej2Input.addEventListener("input", function() {
  const txt = vej2Input.value.trim();
  if (txt.length < 2) {
    vej2List.innerHTML = "";
    vej2List.style.display = "none";
    return;
  }
  doSearchRoad(txt, vej2List, vej2Input);
});

/***************************************************
 * doSearch => henter addresses + stednavne + STRANDPOSTER
 ***************************************************/
function doSearchStrandposter(query) {
  let cql = `UPPER(redningsnr) LIKE UPPER('%${query}%')`;
  let wfsUrl = `https://kort.strandnr.dk/geoserver/nobc/ows?service=WFS` +
               `&version=1.1.0` +
               `&request=GetFeature` +
               `&typeName=nobc:Redningsnummer` +
               `&outputFormat=application/json` +
               `&cql_filter=${encodeURIComponent(cql)}`;

  console.log("Strandposter WFS URL:", wfsUrl);
  return fetch(wfsUrl)
    .then(resp => resp.json())
    .then(geojson => {
      let arr = [];
      if (geojson.features) {
        geojson.features.forEach(feature => {
          let props = feature.properties;
          let rn = props.redningsnr;
          let tekst = `Redningsnummer: ${rn}`;
          let coords = feature.geometry.coordinates; // [lon, lat]
          let lon = coords[0];
          let lat = coords[1];

          arr.push({
            type: "strandpost",
            tekst: tekst,
            lat: lat,
            lon: lon,
            feature: feature
          });
        });
      }
      return arr;
    })
    .catch(err => {
      console.error("Fejl i doSearchStrandposter:", err);
      return [];
    });
}

function doSearch(query, listElement) {
  // Adgangsadresser
  let addrUrl = `https://api.dataforsyningen.dk/adgangsadresser/autocomplete?q=${encodeURIComponent(query)}`;

  // Stednavne
  let stedUrl = `https://services.datafordeler.dk/STEDNAVN/Stednavne/1.0.0/rest/HentDKStednavne?username=NUKALQTAFO&password=Fw62huch!&stednavn=${encodeURIComponent(query + '*')}`;

  // Nu includeres vi strandposter:
  let strandPromise = doSearchStrandposter(query);

  Promise.all([
    fetch(addrUrl).then(r => r.json()).catch(err => { console.error("Adresser fejl:", err); return []; }),
    fetch(stedUrl).then(r => r.json()).catch(err => { console.error("Stednavne fejl:", err); return {}; }),
    strandPromise
  ])
  .then(([addrData, stedData, strandData]) => {
    console.log("addrData:", addrData);
    console.log("stedData:", stedData);
    console.log("strandData:", strandData);

    listElement.innerHTML = "";
    items = [];
    currentIndex = -1;

    // parse addresses => { type: "adresse", tekst, adgangsadresse}
    let addrResults = (addrData || []).map(item => {
      return {
        type: "adresse",
        tekst: item.tekst,
        adgangsadresse: item.adgangsadresse
      };
    });

    // parse stednavne => { type:"stednavn", navn, bbox}
    let stedResults = [];
    if (stedData && stedData.features) {
      stedData.features.forEach(feature => {
        if (feature.properties && feature.properties.stednavneliste) {
          feature.properties.stednavneliste.forEach(sted => {
            stedResults.push({
              type: "stednavn",
              navn: sted.navn,
              bbox: feature.bbox || null
            });
          });
        }
      });
    }

    // strandData => { type:"strandpost", tekst, lat, lon, feature }
    let combined = [...addrResults, ...stedResults, ...strandData];

    combined.forEach(obj => {
      let li = document.createElement("li");
      if (obj.type === "strandpost") {
        li.textContent = obj.tekst;
      } else if (obj.type === "adresse") {
        li.textContent = obj.tekst;
      } else if (obj.type === "stednavn") {
        li.textContent = obj.navn;
      }

      li.addEventListener("click", function() {
        if (obj.type === "adresse" && obj.adgangsadresse && obj.adgangsadresse.id) {
          // fetch /adgangsadresser/{id}
          fetch(`https://api.dataforsyningen.dk/adgangsadresser/${obj.adgangsadresse.id}`)
            .then(r => r.json())
            .then(addressData => {
              let [lon, lat] = addressData.adgangspunkt.koordinater;
              console.log("Placering:", lat, lon);
              // Konstruer fuld adresse:
              let fullAddr = `${addressData.vejnavn || ""} ${addressData.husnr || ""}, ${addressData.postnr || ""} ${addressData.postnrnavn || ""}`;
              // Sæt searchfeltet til den fulde adresse
              searchInput.value = fullAddr;
              // Marker kortet med fuld adresse
              placeMarkerAndZoom([lat, lon], fullAddr);
              // Ryd lister
              resultsList.innerHTML = "";
              vej1List.innerHTML = "";
              vej2List.innerHTML = "";
            })
            .catch(err => console.error("Fejl i /adgangsadresser/{id}:", err));
        }
        else if (obj.type === "stednavn" && obj.bbox) {
          let [x, y] = [obj.bbox[0], obj.bbox[1]];
          placeMarkerAndZoom([y, x], obj.navn);
          searchInput.value = obj.navn;
        }
        else if (obj.type === "strandpost") {
          placeMarkerAndZoom([obj.lat, obj.lon], obj.tekst);
          let props = obj.feature.properties;
          let e = document.getElementById("extra-info");
          e.textContent = `Flere data: Parkeringsplads: ${props.ppl} ...?`;
          searchInput.value = obj.tekst;
        }
      });

      listElement.appendChild(li);
      if (listElement === resultsList) {
        items.push(li);
      }
    });

    listElement.style.display = combined.length > 0 ? "block" : "none";

  })
  .catch(err => console.error("Fejl i doSearch:", err));
}

/***************************************************
 * doSearchRoad => brugt af vej1/vej2
 ***************************************************/
function doSearchRoad(query, listElement, inputField) {
  let addrUrl = `https://api.dataforsyningen.dk/adgangsadresser/autocomplete?q=${encodeURIComponent(query)}&per_side=10`;
  console.log("doSearchRoad kaldt med query:", query, " => ", addrUrl);

  fetch(addrUrl)
    .then(response => response.json())
    .then(data => {
      console.log("Modtaget data fra /adgangsadresser/autocomplete:", data);

      listElement.innerHTML = "";
      items = [];
      currentIndex = -1;

      data.sort((a, b) => a.tekst.localeCompare(b.tekst));

      const unique = new Set();
      data.forEach(item => {
        let vejnavn   = item.adgangsadresse?.vejnavn || "Ukendt vej";
        let kommune   = item.adgangsadresse?.postnrnavn || "Ukendt kommune";
        let postnr    = item.adgangsadresse?.postnr || "?";
        let adgangsId = item.adgangsadresse?.id || null;

        let key = `${vejnavn}-${postnr}`;
        if (unique.has(key)) return;
        unique.add(key);

        let li = document.createElement("li");
        li.textContent = `${vejnavn}, ${kommune} (${postnr})`;

        li.addEventListener("click", function() {
          inputField.value = vejnavn;
          listElement.innerHTML = "";
          listElement.style.display = "none";

          console.log("Valgt vejnavn:", vejnavn, " => henter detaljer for adgangsadresse:", adgangsId);

          if (!adgangsId) {
            console.error("Ingen adgangsadresse.id => kan ikke slå vejkode op");
            return;
          }
          let detailUrl = `https://api.dataforsyningen.dk/adgangsadresser/${adgangsId}?struktur=mini`;
          console.log("detailUrl:", detailUrl);

          fetch(detailUrl)
            .then(r => r.json())
            .then(async detailData => {
              console.log("Detaljeret adressedata:", detailData);

              let roadSelection = {
                vejnavn: vejnavn,
                kommunekode: detailData.kommunekode,
                vejkode: detailData.vejkode,
                husnummerId: detailData.id
              };

              let geometry = await getNavngivenvejKommunedelGeometry(detailData.id);
              roadSelection.geometry = geometry;

              if (inputField.id === "vej1") {
                selectedRoad1 = roadSelection;
              } else if (inputField.id === "vej2") {
                selectedRoad2 = roadSelection;
              }
              console.log("Selected road:", roadSelection);
            })
            .catch(err => {
              console.error("Fejl i fetch /adgangsadresser/{id}:", err);
            });
        });
        listElement.appendChild(li);
        items.push(li);
      });

      listElement.style.display = data.length > 0 ? "block" : "none";
    })
    .catch(err => console.error("Fejl i doSearchRoad:", err));
}

/***************************************************
 * Hent geometri via navngivenvejkommunedel (WKT => parse)
 ***************************************************/
async function getNavngivenvejKommunedelGeometry(husnummerId) {
  let url = `https://services.datafordeler.dk/DAR/DAR/3.0.0/rest/navngivenvejkommunedel?husnummer=${husnummerId}&MedDybde=true&format=json`;
  console.log("Henter navngivenvejkommunedel-data:", url);
  try {
    let r = await fetch(url);
    let data = await r.json();
    console.log("Svar fra navngivenvejkommunedel:", data);

    if (Array.isArray(data) && data.length > 0) {
      let first = data[0];
      if (first.navngivenVej && first.navngivenVej.vejnavnebeliggenhed_vejnavnelinje) {
        let wktString = first.navngivenVej.vejnavnebeliggenhed_vejnavnelinje;
        console.log("Fandt WKT streng:", wktString);

        let geojson = wellknown.parse(wktString);
        console.log("Parsed WKT => GeoJSON:", geojson);

        return geojson;
      } else {
        console.warn("Ingen WKT streng i 'vejnavnebeliggenhed_vejnavnelinje' for husnummer:", husnummerId);
      }
    } else {
      console.warn("Ingen elementer i arrayet for husnummer:", husnummerId);
    }
  } catch (err) {
    console.error("Fejl i getNavngivenvejKommunedelGeometry:", err);
  }
  return null;
}

/***************************************************
 * placeMarkerAndZoom
 ***************************************************/
function placeMarkerAndZoom([lat, lon], displayText) {
  console.log("placeMarkerAndZoom kaldt med:", lat, lon, displayText);
  if (currentMarker) {
    map.removeLayer(currentMarker);
  }
  currentMarker = L.marker([lat, lon]).addTo(map);
  map.setView([lat, lon], 16);

  document.getElementById("address").textContent = displayText;
  const streetviewLink = document.getElementById("streetviewLink");
  streetviewLink.href = `https://www.google.com/maps?q=&layer=c&cbll=${lat},${lon}`;
  console.log("HTML-elementer:",
    document.getElementById("address"),
    document.getElementById("streetviewLink"),
    document.getElementById("infoBox")
  );
  document.getElementById("infoBox").style.display = "block";
}

/***************************************************
 * checkForStatsvej => henter statsvej (Geocloud)
 ***************************************************/
async function checkForStatsvej(lat, lon) {
  console.log("Koordinater sendt til Geocloud:", lat, lon);
  let [utmX, utmY] = proj4("EPSG:4326", "EPSG:25832", [lon, lat]);
  let buffer = 100;
  let bbox = `${utmX - buffer},${utmY - buffer},${utmX + buffer},${utmY + buffer}`;

  let url = `https://geocloud.vd.dk/CVF/wms?
SERVICE=WMS&
VERSION=1.1.1&
REQUEST=GetFeatureInfo&
INFO_FORMAT=application/json&
TRANSPARENT=true&
LAYERS=CVF:veje&
QUERY_LAYERS=CVF:veje&
SRS=EPSG:25832&
WIDTH=101&
HEIGHT=101&
BBOX=${bbox}&
X=50&
Y=50`;

  console.log("API-kald til Geocloud:", url);
  try {
    let response = await fetch(url);
    let textData = await response.text();
    console.log("Rå server response:", textData);

    if (textData.startsWith("Results")) {
      console.warn("Modtaget et tekstsvar, ikke JSON. Prøver at udtrække data...");
      let extractedData = parseTextResponse(textData);
      return extractedData;
    }

    let jsonData = JSON.parse(textData);
    console.log("JSON-parsed data:", jsonData);

    if (jsonData.features && jsonData.features.length > 0) {
      return jsonData.features[0].properties;
    } else {
      return null;
    }
  } catch (error) {
    console.error("Fejl ved hentning af vejdata:", error);
    return null;
  }
}

function parseTextResponse(text) {
  let lines = text.split("\n");
  let data = {};
  lines.forEach(line => {
    let parts = line.split(" = ");
    if (parts.length === 2) {
      let key = parts[0].trim();
      let value = parts[1].trim();
      data[key] = value;
    }
  });
  console.log("Parsed tekstbaserede data:", data);
  return data;
}

/***************************************************
 * Statsvej / info-bokse
 ***************************************************/
const statsvejInfoBox = document.getElementById("statsvejInfoBox");
const statsvejCloseBtn = document.getElementById("statsvejCloseBtn");
statsvejCloseBtn.addEventListener("click", function() {
  statsvejInfoBox.style.display = "none";
  document.getElementById("infoBox").style.display = "none";
  document.getElementById("coordinateBox").style.display = "none";

  if (currentMarker) {
    map.removeLayer(currentMarker);
    currentMarker = null;
  }
});

const infoCloseBtn = document.getElementById("infoCloseBtn");
infoCloseBtn.addEventListener("click", function() {
  document.getElementById("infoBox").style.display = "none";
  document.getElementById("statsvejInfoBox").style.display = "none";
  document.getElementById("coordinateBox").style.display = "none";

  if (currentMarker) {
    map.removeLayer(currentMarker);
    currentMarker = null;
  }
});

/***************************************************
 * "Find X"-knap => find intersection med Turf.js
 ***************************************************/
document.getElementById("findKrydsBtn").addEventListener("click", async function() {
  // Tjek om begge veje er valgt
  if (!selectedRoad1 || !selectedRoad2) {
    alert("Vælg venligst to veje først.");
    return;
  }
  if (!selectedRoad1.geometry || !selectedRoad2.geometry) {
    alert("Geometri ikke tilgængelig for en eller begge veje.");
    return;
  }

  let line1 = turf.multiLineString(selectedRoad1.geometry.coordinates);
  let line2 = turf.multiLineString(selectedRoad2.geometry.coordinates);

  let intersection = turf.lineIntersect(line1, line2);
  console.log("Intersection result:", intersection);

  if (intersection.features.length === 0) {
    alert("De valgte veje krydser ikke hinanden.");
  } else {
    let latLngs = [];

    for (let i = 0; i < intersection.features.length; i++) {
      let feat = intersection.features[i];
      let coords = feat.geometry.coordinates; // [x, y] i EPSG:25832

      let [wgsLon, wgsLat] = proj4("EPSG:25832", "EPSG:4326", [coords[0], coords[1]]);

      let revUrl = `https://api.dataforsyningen.dk/adgangsadresser/reverse?x=${wgsLon}&y=${wgsLat}&struktur=flad`;
      console.log("Reverse geocoding for intersection:", revUrl);
      let revResp = await fetch(revUrl);
      let revData = await revResp.json();

      let popupText = `${revData.vejnavn || "Ukendt"} ${revData.husnr || ""}, ${revData.postnr || "?"} ${revData.postnrnavn || ""}`;

      let evaFormat = `${revData.vejnavn || ""},${revData.husnr || ""},${revData.postnr || ""}`;
      let notesFormat = `${revData.vejnavn || ""} ${revData.husnr || ""}\\n${revData.postnr || ""} ${revData.postnrnavn || ""}`;

      popupText += `
        <br>
        <a href="#" onclick="copyToClipboard('${evaFormat}');return false;">Eva.Net</a> |
        <a href="#" onclick="copyToClipboard('${notesFormat}');return false;">Notes</a>
      `;

      let marker = L.marker([wgsLat, wgsLon]).addTo(map);
      marker.bindPopup(popupText.trim()).openPopup();

      latLngs.push([wgsLat, wgsLon]);
    }

    if (latLngs.length === 1) {
      map.setView(latLngs[0], 16);
    } else {
      map.fitBounds(latLngs);
    }
  }
});

/***************************************************
 * Ford værksteder layer – nyt overlay fra hardcoded data
 ***************************************************/
async function fetchFordWorkshops() {
  try {
    console.log("Ford workshops data (hardcoded):", fordWorkshopsData);

    // Ryd laggruppen
    fordLayer.clearLayers();

    // Gennemløb alle værksteder i fordWorkshopsData
    fordWorkshopsData.forEach(workshop => {
      let lat = workshop.address.lat;
      let lng = workshop.address.lng;
      let name = workshop.name;
      let addressStr = workshop.address.street + ", " + workshop.address.zipcode + " " + workshop.address.city;

      let openingHours = "";
      if (workshop.opening_hours && workshop.opening_hours.length > 0) {
        openingHours = workshop.opening_hours.map(day => {
          if (day.open_time.toLowerCase() === "lukket") {
            return day.open_day_label + ": Lukket";
          } else {
            return day.open_day_label + ": " + day.open_time + " - " + day.close_time;
          }
        }).join("<br>");
      }

      let evaFormat = `${name} - ${addressStr}`;
      let notesFormat = `${name}\n${addressStr}`;

      let popupContent = `<strong>${name}</strong><br>${addressStr}<br><br>
          <em>Åbningstider:</em><br>${openingHours}<br>
          <a href="#" onclick="copyToClipboard('${evaFormat}'); return false;">Eva.Net</a> |
          <a href="#" onclick="copyToClipboard('${notesFormat}'); return false;">Notes</a>`;

      let marker = L.marker([lat, lng]).bindPopup(popupContent);
      marker.addTo(fordLayer);
    });
  } catch (err) {
    console.error("Fejl ved hentning af Ford workshops fra data:", err);
  }
}

// Kald funktionen for at vise Ford værksteder
fetchFordWorkshops();

// Når DOM'en er færdigindlæst, sæt fokus på søgefeltet:
document.addEventListener("DOMContentLoaded", function() {
  document.getElementById("search").focus();
});
