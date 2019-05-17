// ==UserScript==
// @name Google Play Debug
// @namespace https://github.com/catcto/google-play-debug
// @description Google Play Tools, APK Downloader, Get APP Info, Dev Info...
// @icon https://www.gstatic.com/android/market_images/web/favicon_v2.ico
// @homepage https://github.com/catcto/google-play-debug
// @version 0.1
// @match https://play.google.com/store/*
// @license MIT
// @grant GM_xmlhttpRequest
// @grant GM_getValue
// @grant GM_setValue
// @grant GM_deleteValue
// @grant GM_openInTab
// @require https://code.jquery.com/jquery-1.12.4.js
// @require https://code.jquery.com/ui/1.12.1/jquery-ui.js
// @require https://cdnjs.cloudflare.com/ajax/libs/ramda/0.25.0/ramda.min.js
// @run-at document-end
// ==/UserScript==

(function () {
    const DETAILS_REGEX = /https\:\/\/play\.google\.com\/store\/apps\/details\?id=/i;
    const PACKAGES_REGEX = /\/store\/apps\/details\?id=/i;
    const DEVELOPER_REGEX = /https:\/\/play\.google\.com\/store\/apps\/dev\?id=/i;
    const PKGS_A = ['.poRVub', '.card .title'];
    const DOWN_S = 'oocvOe';
    const DOWN_A = 'LkLjZd ScJHi HPiPcc IfEcue';
    const MAPPINGS_DETAILS = {
        title: ['ds:5', 0, 0, 0],
        installs: ['ds:5', 0, 12, 9, 0],
        inAppProducts: ['ds:5', 0, 12, 12, 0],
        minInstalls: {
            path: ['ds:5', 0, 12, 9, 0],
            fun: cleanInt
        },
        score: ['ds:7', 0, 6, 0, 1],
        scoreText: ['ds:7', 0, 6, 0, 0],
        ratings: ['ds:7', 0, 6, 2, 1],
        reviews: ['ds:7', 0, 6, 3, 1],
        histogram: {
            path: ['ds:7', 0, 6, 1],
            fun: buildHistogram
        },
        price: {
            path: ['ds:3', 0, 2, 0, 0, 0, 1, 0, 0],
            fun: (val) => val / 1000000 || 0
        },
        pre_price: {
            path: ['ds:3', 0, 2, 0, 0, 0, 1, 1],
            fun: (val) => {
                if (val && Array.isArray(val)) {
                    return val[0] / 1000000 || 0
                }
                return 0;
            }
        },
        free: {
            path: ['ds:3', 0, 2, 0, 0, 0, 1, 0, 0],
            // considered free only if prize is exactly zero
            fun: (val) => val === 0
        },
        currency: ['ds:3', 0, 2, 0, 0, 0, 1, 0, 1],
        priceText: ['ds:3', 0, 2, 0, 0, 0, 1, 0, 2],
        offersIAP: {
            path: ['ds:5', 0, 12, 12, 0],
            fun: Boolean
        },
        size: ['ds:8', 0],
        androidVersion: {
            path: ['ds:8', 2],
            fun: normalizeAndroidVersion
        },
        androidVersionText: ['ds:8', 2],
        developer: ['ds:5', 0, 12, 5, 1],
        developerId: ['ds:5', 0, 12, 5, 0, 0],
        developerPage: {
            path: ['ds:5', 0, 12, 5, 5, 4, 2],
            fun: developerPage
        },
        developerEmail: ['ds:5', 0, 12, 5, 2, 0],
        developerWebsite: ['ds:5', 0, 12, 5, 3, 5, 2],
        developerAddress: ['ds:5', 0, 12, 5, 4, 0],
        genre: ['ds:5', 0, 12, 13, 0, 0],
        genreId: ['ds:5', 0, 12, 13, 0, 2],
        familyGenre: ['ds:5', 0, 12, 13, 1, 0],
        familyGenreId: ['ds:5', 0, 12, 13, 1, 2],
        icon: ['ds:5', 0, 12, 1, 3, 2],
        banner: ['ds:5', 0, 12, 2, 3, 2],
        screenshots: {
            path: ['ds:5', 0, 12, 0],
            fun: R.map(R.path([3, 2]))
        },
        video: ['ds:5', 0, 12, 3, 0, 3, 2],
        videoImage: ['ds:5', 0, 12, 3, 1, 3, 2],
        contentRating: {
            path: ['ds:5', 0, 12, 4],
            fun: getContentRating,
        },
        contentRatingDescription: ['ds:5', 0, 12, 4, 2, 1],
        adSupported: {
            path: ['ds:5', 0, 12, 14, 0],
            fun: Boolean
        },
        updated: {
            path: ['ds:5', 0, 12, 8, 0],
            fun: (ts) => ts * 1000
        },
        version: ['ds:8', 1],
        recentChanges: ['ds:5', 0, 12, 6, 1],
        comments: {
            path: ['ds:22', 0],
            fun: extractComments
        },
        interactiveElements: {
            path: ['ds:5', 0, 12, 4, 3, 1],
            fun: getInteractiveElements,
        },
        description: {
            path: ['ds:5', 0, 10, 0, 1],
            fun: descriptionText
        },
        descriptionHTML: ['ds:5', 0, 10, 0, 1],
        descriptionTranslation: ['ds:5', 0, 19, 0, 0, 1],
        descriptionShort: ['ds:5', 0, 10, 1, 1]
    };

    var MAPPINGS_DEVELOPER = {
        name: ["ds:5", 0, 0, 0],
        banner: ["ds:5", 0, 9, 0, 3, 2],
        icon: ["ds:5", 0, 9, 1, 3, 2],
        website_url: ["ds:5", 0, 9, 2, 0, 5, 2],
        description: ["ds:5", 0, 10, 1, 1],
    };

    function descriptionText(description) {
        return $('<div>' + description.replace(/<br>/g, '\r\n') + '</div>').text();
    }

    function cleanInt(number) {
        number = number || '0';
        number = number.replace(/[^\d]/g, ''); // removes thousands separator
        return parseInt(number);
    }

    function normalizeAndroidVersion(androidVersionText) {
        androidVersionText = androidVersionText || '';
        const number = androidVersionText.split(' ')[0];
        if (parseFloat(number)) {
            return number;
        }
        return 'VARY';
    }

    function buildHistogram(container) {
        if (!container) {
            return { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
        }
        return {
            1: container[1][1],
            2: container[2][1],
            3: container[3][1],
            4: container[4][1],
            5: container[5][1]
        };
    }

    function extractComments(comments) {
        if (!comments) {
            return [];
        }
        return R.compose(
            R.take(40),
            R.reject(R.isNil),
            R.pluck(4))(comments);
    }

    function developerPage(devUrl) {
        if (devUrl.split('id=')[1] && Number(devUrl.split('id=')[1])) {
            return true
        }
        return false
    }

    function getContentRating(arrList) {
        var content2 = R.path([2, 1], arrList);
        var contentRating = [
            R.path([0], arrList),
        ];
        if (content2) {
            contentRating.push(content2);
        }
        return contentRating;
    }

    function getInteractiveElements(interactiveElementText) {
        if (!interactiveElementText) {
            return [];
        }
        interactiveElementText = interactiveElementText || '';
        var interactiveElementList = [];
        interactiveElementText.split(',').forEach(function (item) {
            item = item.trim();
            interactiveElementList.push(item)
        });
        return interactiveElementList;
    }

    function extractFields(parsedData, MAPPINGS) {
        return R.map((spec) => {
            if (R.is(Array, spec)) {
                return R.path(spec, parsedData);
            }
            // assume spec object
            const input = R.path(spec.path, parsedData);
            return spec.fun(input);
        }, MAPPINGS);
    }

    function matchScriptData(response) {
        const scriptRegex = />AF_initDataCallback[\s\S]*?<\/script/g;
        const keyRegex = /(ds:.*?)'/;
        const valueRegex = /return ([\s\S]*?)}}\);<\//;

        return response.match(scriptRegex).reduce((accum, data) => {
            const keyMatch = data.match(keyRegex);
            const valueMatch = data.match(valueRegex);
            if (keyMatch && valueMatch) {
                const key = keyMatch[1];
                const value = JSON.parse(valueMatch[1]);
                return R.assoc(key, value, accum);
            }
            return accum;
        }, {});
    }

    function initStyle() {
        $('head').append(`
        <style type="text/css">
          .gpc-fieldset{margin:10px; display:block; padding: 20px; border:1px solid #b5b5b5}
          .gpc-legend{display:block; color: #fff; padding:0 5px; margin:0;font-weight: bold;background: #000000;border-radius: 3px;}
          .gpc-a{color:#ff5722 !important;}
          .gpc-d{background-color:#ff5722 !important;}
          .gpc-textarea{width:100%; height:300px; margin:0 auto; display:block;}
          .gpc-console{position:fixed; z-index:999999; bottom:0; left:0; background:#fff; box-shadow:0 -2px 3px 0 rgba(0,0,0,0.15);}
          .gpc-console p{margin-bottom:10px; text-align:center;}
        </style>`);
        $('head').append('<link rel="stylesheet" href="//code.jquery.com/ui/1.12.1/themes/base/jquery-ui.css">');
    }

    function initMenu() {
        let debugHtml = `
         <fieldset class="gpc-console gpc-fieldset"><legend class="gpc-legend">Google Play Debug</legend>
          <p><button class="ui-button ui-widget ui-corner-all" id="downAPK">Download APK</button></p>
          <p><button class="ui-button ui-widget ui-corner-all" id="getPackages">Get Packages</button></p>
          <p><button class="ui-button ui-widget ui-corner-all" id="appInfo">APP Info</button></p>
          <p><button class="ui-button ui-widget ui-corner-all" id="devInfo">Developer Info</button></p>
         </fieldset>`;
        $('body').append(debugHtml);
        $('#downAPK').click(downAPK);
        $('#getPackages').click(getPackages);
        $('#appInfo').click(appInfo);
        $('#devInfo').click(devInfo);
    }

    function msgbox(title, msg) {
        $('<div title="' + title + '">' + msg + '</div>').dialog({
            modal: true,
            width: 480,
            height: 200
        });
    }

    function getPackageName() {
        if (DETAILS_REGEX.test(location.href)) {
            return location.href.replace(DETAILS_REGEX, '');
        }
        return null;
    }

    function getDeveloperID() {
        if (DEVELOPER_REGEX.test(location.href)) {
            return location.href.replace(DEVELOPER_REGEX, '');
        }
        return null;
    }

    function appInfo() {
        let packageName = getPackageName();
        if (packageName) {
            let parsedData = matchScriptData($('body').html());
            let data = extractFields(parsedData, MAPPINGS_DETAILS);
            msgbox('APP Info', '<pre>' + JSON.stringify(data, null, 4) + '</textarea>');
            console.log(packageName);
            console.log(parsedData);
        } else {
            msgbox('Error', 'This is not a valid google play details url');
        }
    }

    function devInfo() {
        let developerID = getDeveloperID();
        if (developerID) {
            let parsedData = matchScriptData($('body').html());
            let data = extractFields(parsedData, MAPPINGS_DEVELOPER);
            msgbox('Developer Info', '<pre>' + JSON.stringify(data, null, 4) + '</textarea>');
            console.log(developerID);
            console.log(parsedData);
        } else {
            msgbox('Error', 'This is not a valid google play dev url');
        }
    }

    function getPackages() {
        let pkgs = '';
        PKGS_A.forEach(function (cls) {
            $(cls).each(function () {
                if (PACKAGES_REGEX.test($(this).attr('href'))) {
                    pkgs += $(this).attr('href').replace(PACKAGES_REGEX, '') + '<br>';
                }
            });
        });
        msgbox('Get Packages', pkgs);
        return false;
    }

    function downAPK() {
        let packageName = getPackageName();
        if (packageName) {
            GM_openInTab('https://apkpure.com/region-free-apk-download?p=' + location.href);
        } else {
            msgbox('Error', 'This is not a valid URL');
        }
    }

    function init() {
        initStyle();
        initMenu();
    }

    init();
})();