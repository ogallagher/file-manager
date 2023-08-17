import * as dotenv from 'dotenv'
import pino from 'pino'
import { fileURLToPath } from 'node:url'
import * as fs from 'node:fs/promises'
import express from 'express'
import https from 'https'
import http from 'node:http'
import cors from 'cors'
import path from 'node:path'
import yargs from 'yargs'
import { hideBin } from 'yargs/helpers'
import reverse_line_reader from 'reverse-line-reader'
import mime from 'mime'

const URL_PATH_FACE_APP_ID = '/facebook-app-id'
const URL_PATH_NEXT_PHOTO_UPLOAD = '/next-album-photo'
const URL_PATH_DO_UPLOADS = '/do-uploads'
const SERVER_DIR = path.dirname(fileURLToPath(import.meta.url))
const APP_DIR = path.join(SERVER_DIR, '..')
const UPLOADS_FILE_NAME_DEFAULT = 'face_uploads.json.txt'
const TARGET_MOUNT_DIRNAME = 'mount'

const cli_args = get_cli_args()

const logger = pino({
    level: cli_args.logLevel
}).child({
    name: 'face-manager-server'
})

dotenv.config()
process.env.SERVER_HOST = process.env.SERVER_HOST || 'localhost'
logger.debug('loaded .env to process.env')

/**
 * Name of target directory, without path from app dir.
 */
let target_dir_name = path.basename(cli_args.targetDir)

// mount target dir as symlink for public access
fs.mkdir(TARGET_MOUNT_DIRNAME, {recursive: true})
.then(
    () => {
        logger.info(`created mount dir at ${path.join(SERVER_DIR, TARGET_MOUNT_DIRNAME)}`)
    },
    (err) => {
        if (err.code === 'EEXIST') {
            logger.info(`mount dir ${TARGET_MOUNT_DIRNAME} already exists`)
        }
        else {
            logger.error(`failed to create target mount dir ${err.stack}`)
        }
    }
)
.finally(() => {
    fs.symlink(
        path.relative(TARGET_MOUNT_DIRNAME, cli_args.targetDir), 
        path.join(SERVER_DIR, TARGET_MOUNT_DIRNAME, target_dir_name)
    )
    .then(
        () => {
            logger.info(`mounted target dir ${cli_args.targetDir}`)
        },
        (err) => {
            if (err.code === 'EEXIST') {
                logger.info(`target dir ${cli_args.targetDir} already mounted`)
            }
            else {
                logger.error(`failed to mount target dir ${cli_args.targetDir} at mount/. ${err.code}: ${err.stack}`)
            }
        }
    )
})

// load index file
const index_file_path = cli_args.indexFile
/**
 * @type {Object}
 */
const index = await fs.readFile(
    index_file_path, 
    {encoding: 'utf-8'}
).then((index_str) => JSON.parse(index_str))
const index_keys = Object.keys(index).sort()
logger.info(`loaded index from ${index_file_path} containing ${index_keys.length} file path keys`)
logger.debug(index)

// init uploads file
const uploads_file_path = (
    cli_args.uploadsFile 
    || path.join(path.dirname(index_file_path), UPLOADS_FILE_NAME_DEFAULT)
)
fs.access(uploads_file_path, fs.constants.F_OK)
.then(
    () => {
        logger.info(`found existing uploads file ${uploads_file_path}`)
    },
    (err) => {
        logger.info(`uploads file does not yet exist. create new ${uploads_file_path}`)
        return fs.mkdir(path.dirname(uploads_file_path), {recursive: true})
        .then(() => {
            return fs.writeFile(uploads_file_path, '', {encoding: 'utf-8'})
        })
    }
)

const server = express()
server.use(cors({
    // allow all origins
    origin: '*'
}))

// webserver endpoints

server.use(express.static(SERVER_DIR))

server.get(
    '/', 
    /**
     * 
     * @param {express.Request} req 
     * @param {express.Response} res 
     */
    function(req, res) {
        res.sendFile('./face_manager.html', {
            root: SERVER_DIR
        })
    }
)

server.get(
    URL_PATH_FACE_APP_ID, 
    /**
     * 
     * @param {express.Request} req 
     * @param {express.Response} res 
     */
    function(req, res) {
        logger.info(`send facebook app id for ${req.path}`)
        res.send({
            app_id: process.env.FACEBOOK_APP_ID,
            server_host: process.env.SERVER_HOST
        })
    }
)

server.get(
    URL_PATH_NEXT_PHOTO_UPLOAD, 
    /**
     * Get the next photo to upload. 
     * 
     * If there exists a latest complete upload entry in the uploads file, attempt to select the next image file,
     * according to the index.
     * If uploads is empty, select the first image file from the index.
     * 
     * @param {express.Request} req 
     * @param {express.Response} res 
     */
    function(req, res) {
        logger.info(`send next photo to upload for ${req.path}`)

        get_last_upload(uploads_file_path)
        .then(
            /**
             * @param {undefined|{
             *  local_path: string,
             *  index_idx: number,
             *  album_id: string,
             *  photo_id: string,
             *  caption: string
             * }} last_upload
            */
            (last_upload) => {
                /**
                 * Next photo upload details. Note `local_path` is relative to the target dir.
                 * 
                 * @type {{
                 *  local_path: string,
                 *  mount_path: string,
                 *  index_idx: number,
                 *  mime_type: string,
                 *  file_size: number,
                 *  exif_meta: Object,
                 *  album_id: string,
                 *  photo_id: string,
                 *  caption: string
                 * }}
                 */
                let next_upload = {
                    album_id: null,
                    photo_id: null,
                    caption: null
                }
                
                if (last_upload !== undefined) {
                    logger.info(`last upload was ${JSON.stringify(last_upload)}`)
                    next_upload.index_idx = last_upload.index_idx + 1
                    next_upload.album_id = last_upload.album_id
                }
                else {
                    logger.info('last upload not found; assume next upload is first in index')
                    next_upload.index_idx = 0
                }
                
                let next_upload_found = false
                /**
                 * @type {string}
                 */
                let file_id
                /**
                 * @type {string[]}
                 */
                let index_entry
                /**
                 * @type {string}
                 */
                let abs_path
                while (!next_upload_found && next_upload.index_idx < index_keys.length) {
                    file_id = index_keys[next_upload.index_idx]
                    index_entry = index[file_id][0].split('//')
                    logger.debug(`next upload index entry for ${file_id} = ${index_entry}`)
                    // local path
                    next_upload.local_path = index_entry[0]
                    abs_path = path.join(cli_args.targetDir, next_upload.local_path)

                    // confirm next upload is an image w MIME type
                    logger.debug(`get MIME type of ${abs_path}`)
                    next_upload.mime_type = mime.getType(abs_path)
                    if (next_upload.mime_type !== null && next_upload.mime_type.startsWith('image/')) {
                        next_upload_found = true
                    }
                    else {
                        next_upload.index_idx++
                    }
                }
                
                if (next_upload_found) {
                    // mount path
                    next_upload.mount_path = path.join(TARGET_MOUNT_DIRNAME, target_dir_name)

                    // exif metadata
                    if (index_entry.length > 1) {
                        next_upload.exif_meta = JSON.parse(index_entry[1])
                    }
                    else {
                        next_upload.exif_meta = null
                    }

                    // file size
                    fs.stat(abs_path)
                    .then((stats) => {
                        next_upload.file_size = stats.size
                    })
                    // deliver next upload
                    .then(() => {
                        logger.info(`next upload = ${JSON.stringify(next_upload)}`)
                        res.send(next_upload)
                    })
                }
                else {
                    let message = `no more images to load in ${cli_args.targetDir}`
                    logger.info(message)
                    res.send({
                        message: message
                    })
                }
            },
            (err) => {
                let message = `failed to fetch last upload. cannot assume next upload. ${err.stack}`
                logger.error(message)
                res.send({
                    error: message
                })
            }
        )
    }
)

// serve http:80 and https:443
Promise.all([
    /*
    create self signed cert and private key:
    openssl genrsa -out server.key 2048
    openssl rsa -in server.key -out server.key
    openssl req -sha256 -new -key server.key -out server.csr -subj '/CN=localhost'
    openssl x509 -req -sha256 -days 365 -in server.csr -signkey server.key -out server.crt
    cat server.crt server.key > cert.pem
    */
    fs.readFile('secret/https/server.key'),
    fs.readFile('secret/https/cert.pem')
])
.then((key_cert) => {
    let server_https = https.createServer(
        {
            key: key_cert[0],
            cert: key_cert[1]
        },
        server
    )
    server_https.listen(443, () => {
        logger.info(`deployed face-manager at ${process.env.SERVER_HOST}, serving local dir ${SERVER_DIR}`)
    })
    http.createServer(server).listen(80)
})

/**
 * 
 * @param {string} uploads_file_path 
 * 
 * @returns {{
 *  local_path: string,
 *  mount_path: string,
 *  index_idx: string,
 *  mime_type: string,
 *  file_size: number,
 *  exif_meta: Object,
 *  album_id: string,
 *  photo_id: string,
 *  caption: string
 * }}
 */
function get_last_upload(uploads_file_path) {
    return new Promise(function(res, rej) {
        let upload

        reverse_line_reader.eachLine(
            uploads_file_path, 
            /**
             * 
             * @param {string} upload_str 
             * @returns {false}
             */
            function(upload_str) {
                if (upload_str.length > 0) {
                    upload = JSON.stringify(upload_str)
                }

                // stop reading new lines
                return false
            }
        )
        .then((err) => {
            if (err) {
                rej(err)
            }
            else {
                res(upload)
            }
        })
    })
}

/**
 * 
 * @returns {{
 *  logLevel: string,
 *  indexFile: string,
 *  uploadsFile?: string,
 *  targetDir: string
 * }}
 */
function get_cli_args() {
   return yargs(hideBin(process.argv))

   .alias('log-level', 'l')
   .describe('log-level', 'Set logging level.')
   .default('log-level', 'info')

   .alias('index-file', 'i')
   .describe('index-file', 'Path to index file describing image files to be uploaded.')
   .default('index-file', path.join(APP_DIR, 'test/resources/res/test_resources_target_img/index.json'))

   .alias('uploads-file', 'u')
   .describe(
       'uploads-file', 
       'Path to uploads file that tracks progress and is used to resume from pause. '
       + `Default is file next to index-file called ${UPLOADS_FILE_NAME_DEFAULT}`
   )

   .alias('target-dir', 't')
   .describe('target-dir', 'Path to directory containing image files to be uploaded.')
   .default('target-dir', path.join(APP_DIR), 'test/resources/target/img')

   .argv
}