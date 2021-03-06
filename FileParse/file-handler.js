var path = require('path');
const imageModel = require('../server/models/image');
const fileModel = require('../server/models/file');
const mongoose = require('mongoose');
var ppjParse = require('./ppjParse');
var csvParse = require('./csvParse');
//const runsync = require("runsync");
const child_process = require('child_process');

// Since the ppj parser doesnt hold much state to it, we only need to declare it once to
// do all of our conversions
var ppjParser = new ppjParse();
var csvParser = new csvParse();

class fileHandler {
    constructor(file_list) {
        this.file_list = file_list;
        //this.processList();

    }

    async processList() {
        let extDic = {};
        if (this.file_list.length >= 1) {
            // Group files by file extension into extDic
            for (const element of this.file_list) {
                let fileext = path.extname(element.name).toLowerCase();
                if (extDic[fileext]) {
                    extDic[fileext].push(element);
                } else {
                    extDic[fileext] = [element];
                }
            }
            // Loop through each extension found in extDic
            // TODO: make these work with different character cases in ext
            console.log("ExtDIC------------: ", extDic);
            for (const key in extDic) {

                if (key.match(/\.(ppj)$/i)) {
                    // if(key == ".ppj") {
                    console.log("Parsing all .ppj files");
                    //console.log(JSON.stringify(extDic[key]));
                    // Run appropriate action for all .ppj files
                    for (const element of extDic[key]) {
                        await this.ppjinfo(element.path, element.name);
                    }
                }
                else if (key.match(/\.(cr2)$/i)) {
                    console.log("Parsing all .cr2 files");
                    for (const element of extDic[key]) {
                        await this.ppjinfo(element.path, element.name);
                    }
                }
                else if (key.match(/\.(csv)$/i)) {
                    // if(key == ".csv") {
                    console.log("Parsing all .csv files");
                    for (const element of extDic[key]) {
                        await this.csvinfo(element.path, element.name);
                    }
                }
                else if (key.match(/\.(ntf)$/i)) {
                    // if(key == ".ntf") {
                    console.log("Parsing all .ntf files");
                    for (const element of extDic[key]) {
                        await this.ntfinfo(element.path, element.name);
                    }
                }
                else if (key.match(/\.(jpeg|jpg)$/i)) {
                    // if(key == ".jpg") {
                    console.log("Parsing all .jpg files");
                    for (const element of extDic[key]) {
                        await this.jpginfo(element.path, element.name);
                    }
                }
                else if (key.match(/\.(tif|tiff)$/i)) {
                    // if(key == ".tif") {
                    console.log("Parsing all .tif files");
                    for (const element of extDic[key]) {
                        await this.tiffinfo(element.path, element.name);
                    }
                }
                else if (key.match(/\.(urw)$/i)) {
                    // if(key == ".urw") {
                    console.log("Parsing all .urw files");
                    for (const element of extDic[key]) {
                        await this.urwinfo(element.path, element.name);
                    }
                }
                else {
                    console.log("Parsing all ", key, " files");
                    console.log(String(key));
                    for (const element of extDic[key]) {
                        await this.custominfo(element.path, element.name, key);
                    }

                }
            }
            // TODO: Loop through all images, make sure any
            // that have thumbnail_bool == true and rgb == null
            // get rgb values set to thumbnail values, 
            // thumbnail_only bool value set to true
            var thumbNoRGB = await imageModel.find({
                'thumbnail_bool': true, 
                'rgb_data': null,
            });
            console.log("thumnails missing rgb: " + JSON.stringify(thumbNoRGB));
            var agg = await imageModel.aggregate([
                {$match: 
                    {
                    'thumbnail_bool': true, 
                    'rgb_data': null,
                    }
                },
                // Data to insert into record               
                {$addFields: {
                    // Referencing value of other fields with "$field"
                    // thumbnail_data "reconstitutes" into full record when referenced,
                    // so must pass _id param of it to rgb_data
                    rgb_data: '$thumbnail_data._id',
                    rgb_data_path: '$thumbnail_path',
                    thumbnail_only: true}}
            ]);
            console.log("Aggregation: " + JSON.stringify(agg));
            // Insert updated records back into Image model by _id
            for (const record of agg) {
                console.log("Updating thumbnail info for id " + record._id);
                var updated = await imageModel.findByIdAndUpdate(
                    // ID to update
                    record._id,
                    // Fields to update and values
                    {rgb_data: record.rgb_data,
                    rgb_data_path: record.rgb_data_path,
                    thumbnail_only: true},
                    // Options
                    {// Creates record if not found
                    upsert: false,
                    // This option is required by system
                    useFindAndModify: false,
                    // Returns newly created object
                    new: true},
                    function (err) {
                        if (err) console.log("Error updating image thumbnail data" + err);

                        return console.log("Image model thumbnail data updated " + JSON.stringify(record._id));
                    }
                );
                console.log("updated record for thumbnail info: " + JSON.stringify(updated));
            }
            // var updated = await imageModel.updateMany(
            //     // Search query
            //     {'thumbnail_bool': true, 
            //     'rgb_data': null,
            //     'rgb_data_path': "Unknown"},
            //     // Data to insert into record               
            //     {$set: {
            //         // Referencing value of other fields with "$field"
            //         rgb_data: '$thumbnail_data',
            //         rgb_data_path: '$thumbnail_path',
            //         thumbnail_only: true}
            //     },
            //     // Insert options
            //     {                    
            //         // This option is required by system
            //         useFindAndModify: false,
            //         // Returns newly created object
            //         new: true
            //     },
            //     // Error handling
            //     async function (err) {
            //         if (err) console.log("Error inserting to image model " + err);
                    
                    
            //         return console.log("Updated rgb paths for thumbnails ");
            //     }
            // );
            //console.log("records updated: " + JSON.stringify(updated));
        }
        console.log(JSON.stringify(Object.keys(extDic)));
    }


    // Parses files to see if they compy with the given datasets
    // naming rules, and extracts values into an object, which is
    // returned. If the filename does not match the format type, 
    // it returns null.
    parseFilename(filename) {
        let result = null;
        try {
            // Check last 5 chars of filename for an extension
            // Chop if off if found
            let last5 = filename.slice(-5, filename.length);
            if (last5 && last5.includes('.')) {
                filename = filename.substring(0, filename.lastIndexOf('.'));
            }
            // console.log("last5: " + last5);
            // If last 5 letters of the filename are "thumb",
            // it's a thumbnail, slice "thumb" off
            let last5thumb = filename.slice(-5, filename.length);
            if (last5thumb && last5thumb == "thumb") {
                filename = filename.slice(0, -5);                
            }
            // Split filename by underscores
            let filenameParts = filename.split('_');
            // If filename has '_' and at least 3 parts, extract info
            if (filenameParts && filenameParts.length >= 3) {
                let dateraw = filenameParts[0];
                let timeraw = filenameParts[1];
                let camera = filenameParts[2];
                // console.log(JSON.stringify(filenameParts));
                // console.log("dateraw: " + dateraw);
                // Parsing date string into UNIX time
                let parsedDate = Date.parse(dateraw);
                // Create new Date obj from string
                let dateDateObj = new Date(parsedDate);
                // console.log("dateDateObj: " + dateDateObj);
                // console.log("timeraw: " + timeraw);
                // Add in formatting marks to the timestamp so 
                // it parses correctly
                let hours = timeraw.slice(0, 2);
                let minutes = timeraw.slice(2, 4);
                let seconds = timeraw.slice(4, 6);
                let subsecs = timeraw.slice(6, timeraw.length);
                let timefmtd = hours + ":" + minutes + ":" + seconds;
                // Add in fractional seconds, if they are there
                if (timeraw.length > 6) {
                    timefmtd += "." + subsecs;
                }
                //console.log("timefmtd: " + timefmtd);
                let parsedTime = new Date('1970-01-01T' + timefmtd + 'Z');
                let timestamp = dateDateObj.getTime() + parsedTime.getTime();
                //console.log("timestamp: " + timestamp);
                let parsedstamp = new Date(timestamp);
                //console.log("parsedstamp: " + parsedstamp);
                var dataitems = {
                    date: dateDateObj,
                    time: parsedstamp,
                    camera: camera,
                    thumbnail: false
                }                
                // console.log("last5: " + last5);
                if (last5thumb && last5thumb == "thumb") {
                    dataitems.thumbnail = true;
                }
                // imgid does not exist in all filenames
                // if (filenameParts.length > 3) {
                //     let imgid = filenameParts[3];
                //     // If it's a thumbnail, slice off 'thumb' from id
                //     if (dataitems.thumbnail && imgid.length > 5) {
                //         dataitems['imgid'] = imgid.slice(0, imgid.length - 5);
                //     } else {
                //         dataitems['imgid'] = imgid;
                //     }
                // }

                // console.log("dataitems: " + JSON.stringify(dataitems));

                result = dataitems;
            }
        } catch (error) {
            console.log("Filename parse error: " + error);
            console.log("Filename attempted to parse: " + filename);
        }

        return result;

    }

    addFilenameImage(imgobject, filenamevalues) {
        var result = imgobject;
        if (filenamevalues) {
            result['time'] = filenamevalues.time;
            result['camera'] = filenamevalues.camera;
            if (filenamevalues.imgid) {
                result['imgid'] = filenamevalues.imgid;
            }

        }
        return result;
    }
    addThumbnailImage(thumbnail) {
        // TODO: add appropriate db calls for updating
        // image record with link to thumbnail
    }
    async queryFileModel(query) {
        let result = await fileModel.find(query).exec();
        return result;
    }
    // Adds a file to the file model
    async addFileToDB(filepath, extension, filename, metaData) {
        let folder = path.dirname(filepath).split(path.sep).pop();
        console.log("ADD TO DB Folder name: " + folder);
        let base_path = this.chopfilethumb(this.chopfilename(filepath));
        let isThumb = this.isfilethumb(this.chopfilename(filename));
        let fileDBObj = await fileModel.findOneAndUpdate(
            // Search query
            { 'path': filepath },
            // Data to insert into record
            {
                $set: {
                    'folder': folder,
                    'filename': filename,
                    'extension': extension,
                    'path': filepath,
                    'base_path': base_path,
                    'JSONData': JSON.stringify(metaData),
                    'thumb': isThumb
                }
            },
            // Insert options
            {
                // Creates record if not found
                upsert: true,
                // This option is required by system
                useFindAndModify: false,
                // Returns newly created object
                new: true
            },
            // Error handling
            async function (err) {
                if (err) console.log("Error inserting to file model" + err);
                // If query fails due to stupid Mongoose bug...
                if (err && err.code === 11000) {
                    // Just run it again
                    fileDBObj = await fileModel.findOneAndUpdate(
                        // Search query
                        { 'path': filepath },
                        // Data to insert into record
                        {
                            $set: {
                                'folder': folder,
                                'filename': filename,
                                'extension': extension,
                                'path': filepath,
                                'base_path': base_path,
                                'JSONData': JSON.stringify(metaData),
                                'thumb': isThumb
                            }
                        },
                        // Insert options
                        {
                            // Creates record if not found
                            upsert: true,
                            // This option is required by system
                            useFindAndModify: false,
                            // Returns newly created object
                            new: true
                        },
                        // Error handling
                        function (err) {
                            if (err) console.log("Error inserting to file model on second try" + err);

                            return console.log("File model saved on second try, path " + filepath);
                        });
                }
                return console.log("File model saved, path " + filepath);
            });
        //console.log('fileDBObj: ' + fileDBObj);
        return fileDBObj;
    }

    // Adds image to image model
    async addImageToDB(imagedata) {
        // check if image is in db
        // If so, update relevant info
        // If not, create record with arg data
        //let fileObjJson = JSON.stringify(fileInserted);
        console.log("IMAGEDATA BASE: ", imagedata.base_name);
        console.log("IMAGEDATA PATH: ", imagedata.base_path);
        let noThumb = this.chopfilethumb(imagedata.base_path);
        console.log("IMAGEDATA nothumb: ", noThumb);
        let imgQuery = await imageModel.find({ 'base_name': imagedata.base_name });
        //console.log("imgquery: " + imgQuery);
        let imageDBObj = await imageModel.findOneAndUpdate(
            // Search query
            { 'base_path': noThumb },
            // Data to insert into record
            { $set: imagedata },
            // Insert options
            {
                // Creates record if not found
                upsert: true,
                // This option is required by system
                useFindAndModify: false,
                // Returns newly created object
                new: true
            },
            // Error handling
            function (err) {
                if (err) console.log("Error inserting to image model" + err);

                return console.log("image model saved, base_name " + imagedata.base_path);
            });
        // console.log("Image after update: " + imageDBObj);

    }

    // Creates file and image model records in db for a .ppj file
    async ppjinfo(filepath, filename) {
        let folder = path.dirname(filepath).split(path.sep).pop();
        var metaData = ppjParser.convertXml(filepath);
        let fileInserted = await this.addFileToDB(filepath, ".ppj", filename, metaData);
        var points = [];
        var i;
        // Only go from 0 to i-1 because the last point is the center
        for (i = 0; i < (metaData.pointMap.length - 1); i++) {
            let coords = metaData.pointMap[i].wgsCoordinates;
            points.push([coords[1], coords[0]]);
        }
        let base_name = this.chopfilename(filename);
        let base_path = this.chopfilename(filepath);
        // Parsing out metadata from filename
        let filenameData = this.parseFilename(base_name);

        let imgdbobj = {
            //'_id': filepath,
            'base_name': base_name,
            'base_path': base_path,
            //'file_path': filepath,
            //'file_extension': 'ppj',
            'points': JSON.stringify(points),
            //'mission': this.getMissionName(filepath),
            'ppj_data': fileInserted,
            'ppj_data_path': filepath
        };
        // Add metadata parsed from filename into object 
        let toInsert = this.addFilenameImage(imgdbobj, filenameData);
        // Overwrite timestamp in filename with timestamp from .ppj file
        imgdbobj['time'] = metaData.gpsTimeStamp;
        console.log(JSON.stringify(toInsert));
        // Insert image object into db
        await this.addImageToDB(toInsert);
    }

    // Creates file and image model records in db for a .csv file
    async csvinfo(filepath, filename) {
        var metaData = csvParser.convertCSV_stripped(filepath);
        //console.log(JSON.stringify("CSV metadata: " + JSON.stringify(metaData)));
        let fileInserted = await this.addFileToDB(filepath, ".csv", filename, metaData);
        let base_name = this.chopfilename(filename);
        let base_path = this.chopfilename(filepath);
        let filenameData = this.parseFilename(filename);
        let imgdbobj = {
            'base_name': base_name,
            'base_path': base_path,
            // TODO: There are 2 fields of view, x and y. Do we average them? Make a string of both?
            'fov': metaData.lensFOV_H,
            // TODO: Concat a lat and long string, or alter front end to hold separate lat/long
            'lla': metaData.centerPnt_Lat,
            // TODO: Calculate velocity vector from xyz values
            'velocity': metaData.velNorth,
            'gsd': metaData.groundSpd,
            'csv_data': fileInserted,

            'csv_data_path': filepath
        }
        // Add metadata parsed from filename into object 
        let toInsert = this.addFilenameImage(imgdbobj, filenameData);
        await this.addImageToDB(toInsert);
    }
    // Creates file and image model records in db for a .csv file
    async ntfinfo(filepath, filename) {
        let folder = path.dirname(filepath).split(path.sep).pop();
        var metaData = child_process.execSync("gdalinfo -json " + filepath);
        // console.log("ntf metadata: " + metaData);
        let fileInserted = await this.addFileToDB(filepath, ".ntf", filename, metaData);
        let base_name = this.chopfilename(filename);
        let base_path = this.chopfilename(filepath);
        let filenameData = this.parseFilename(filename);
        let imgdbobj = {
            'base_name': base_name,
            'base_path': base_path,
            'mission': folder,
            'ntf_data': fileInserted,
            'ntf_data_path': filepath,
            'rgb_data': fileInserted,
            'rgb_data_path': filepath,

        }
        let toInsert = this.addFilenameImage(imgdbobj, filenameData);
        await this.addImageToDB(toInsert);
    }

    // Creates file and image model records in db for a .jpg file
    async jpginfo(filepath, filename) {

        let filenameData = this.parseFilename(filename);
        let folder = path.dirname(filepath).split(path.sep).pop();
        let fileInserted = await this.addFileToDB(filepath, ".jpg", filename, {});
        // Handle .jpgs differently depending on whether they
        // are a thumbnail
        if (!(filenameData.thumbnail)) {
            // If it's not a thumbnail...
            let base_name = this.chopfilename(filename);
            let base_path = this.chopfilename(filepath);
            var imgdbobj = {
                'base_name': base_name,
                'base_path': base_path,
                'mission': folder,
                'rgb_data': fileInserted,
                'rgb_data_path': filepath,
                'jpg_data': fileInserted,
                'jpg_data_path': filepath
            };

        } else {
            // If it is a thumbnail...
            let base_name = this.chopfilename(filename).slice(0, -5);
            let base_path = this.chopfilename(filepath);
            let noThumb = this.chopfilethumb(base_path)
            var imgdbobj = {
                'base_name': base_name,
                'base_path': noThumb,
                'mission': folder,
                'thumbnail_bool': true,
                //'rgb_data': fileInserted,
                //'rgb_data_path': filepath,
                'thumbnail_path': filepath,
                'thumbnail_extension': path.extname(filename),
                'thumbnail_data': fileInserted
            }
        }
        //console.log("imgobjdb: " + imgdbobj);
        let toInsert = this.addFilenameImage(imgdbobj, filenameData);
        //console.log("toinsert: " + toInsert);
        await this.addImageToDB(toInsert);

    }

    // Creates file and image model records in db for a .tif file
    async tiffinfo(filepath, filename) {
        let filenameData = this.parseFilename(filename);
        let folder = path.dirname(filepath).split(path.sep).pop();
        let fileInserted = await this.addFileToDB(filepath, ".tif", filename, {});
        let base_name = this.chopfilename(filename);
        let base_path = this.chopfilename(filepath);
        var imgdbobj = {
            'base_name': base_name,
            'base_path': base_path,
            'mission': folder,
            'rgb_data': fileInserted,
            'rgb_data_path': filepath,
            'tiff_data': fileInserted,
            'tiff_data_path': filepath
        };
        //console.log("imgobjdb: " + imgdbobj);
        let toInsert = this.addFilenameImage(imgdbobj, filenameData);
        //console.log("toinsert: " + JSON.stringify(toInsert));
        await this.addImageToDB(toInsert);

    }

    // Creates file and image model records in db for a .urw file
    async urwinfo(filepath, filename) {
        let filenameData = this.parseFilename(filename);
        let folder = path.dirname(filepath).split(path.sep).pop();
        let fileInserted = await this.addFileToDB(filepath, ".urw", filename, {});
        let base_name = this.chopfilename(filename);
        let base_path = this.chopfilename(filepath);
        var imgdbobj = {
            'base_name': base_name,
            'base_path': base_path,
            'mission': folder,
            'rgb_data': fileInserted,
            'rgb_data_path': filepath,
            'urw_data': fileInserted,
            'urw_data_path': filepath
        };
        //console.log("imgobjdb: " + imgdbobj);
        let toInsert = this.addFilenameImage(imgdbobj, filenameData);
        //console.log("toinsert: " + JSON.stringify(toInsert));
        await this.addImageToDB(toInsert);

    }
    // Creates file and image model records in db for a .cr2 file
    async cr2info(filepath, filename) {
        let filenameData = this.parseFilename(filename);
        let folder = path.dirname(filepath).split(path.sep).pop();
        let fileInserted = await this.addFileToDB(filepath, ".cr2", filename, {});
        let base_name = this.chopfilename(filename);
        let base_path = this.chopfilename(filepath);
        var imgdbobj = {
            'base_name': base_name,
            'base_path': base_path,
            'mission': folder,
            'rgb_data': fileInserted,
            'rgb_data_path': filepath,
            'cr2_data': fileInserted,
            'cr2_data_path': filepath
        };
        //console.log("imgobjdb: " + imgdbobj);
        let toInsert = this.addFilenameImage(imgdbobj, filenameData);
        //console.log("toinsert: " + JSON.stringify(toInsert));
        await this.addImageToDB(toInsert);
    }
    // Creates file model records in db for a custom file
    async custominfo(filepath, filename, fileExt) {
        let filenameData = this.parseFilename(filename);
        let folder = path.dirname(filepath).split(path.sep).pop();
        let fileInserted = await this.addFileToDB(filepath, fileExt, filename, {});
    }
    // Check last 5 chars of filename for an extension
    // Chop it off if found
    chopfilename(filename) {

        let last5 = filename.slice(-5, filename.length);
        if (last5 && last5.includes('.')) {
            filename = filename.substring(0, filename.lastIndexOf('.'));
        }
        return filename;
    }

    chopfilethumb(filename) {

        if (filename.length > 5) {
            let last5 = filename.slice(-5, filename.length);
            if (last5 && last5.includes('thumb')) {
                filename = filename.substring(0, filename.lastIndexOf('thumb'));
            }
        }
        return filename;
    }
    // returns true or false if the last 5 character are 'thumb'
    isfilethumb(filename) {
        let toRet = false;
        if (filename.length > 5) {
            let last5 = filename.slice(-5, filename.length);
            if (last5 && last5.includes('thumb')) {
                toRet = true;
            }
        }
        return toRet;
    }
}

module.exports = fileHandler 