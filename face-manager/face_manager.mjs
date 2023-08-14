import * as dotenv from 'dotenv'
import pino from 'pino'
import { fileURLToPath } from 'node:url'
import * as fs from 'node:fs/promises'
import express from 'express'
import cors from 'cors'
import path from 'node:path'
import yargs from 'yargs'
import { hideBin } from 'yargs/helpers'
import reverse_line_reader from 'reverse-line-reader'

const URL_PATH_AUTH_RESULT = '/authresult'
const URL_PATH_FACE_APP_ID = '/facebook-app-id'
const URL_PATH_NEXT_PHOTO_UPLOAD = '/next-album-photo'
const URL_PATH_PHOTO_CONTENT = '/photo-content'
const SERVER_DIR = path.dirname(fileURLToPath(import.meta.url))
const APP_DIR = path.join(SERVER_DIR, '..')
const UPLOADS_FILE_NAME_DEFAULT = 'face_uploads.json.txt'

const cli_args = get_cli_args()

const logger = pino({
    level: cli_args.logLevel
}).child({
    name: 'face-manager-server'
})

dotenv.config()
process.env.SERVER_PORT = process.env.SERVER_PORT || 80
logger.debug('loaded .env to process.env')

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

server.use(express.static(SERVER_DIR))
server.get('/', function(req, res) {
    res.sendFile('./face_manager.html', {
        root: SERVER_DIR
    })
})
server.get(URL_PATH_FACE_APP_ID, function(req, res) {
    logger.info(`send facebook app id for ${req.path}`)
    res.send({
        value: process.env.FACEBOOK_APP_ID
    })
})
server.get(URL_PATH_NEXT_PHOTO_UPLOAD, function(req, res) {
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
             *  index_idx: number,
             *  exif_meta: Object,
             *  album_id: string,
             *  photo_id: string,
             *  caption: string
             * }}
             */
            let next_upload = {}

            if (last_upload !== undefined) {
                logger.info(`last upload was ${JSON.stringify(last_upload)}`)
                next_upload = last_upload.index_idx + 1
            }
            else {
                logger.info('last upload not found; assume next upload is first in index')
                next_upload.index_idx = 0
            }
            
            let file_id = index_keys[next_upload.index_idx]
            /**
             * @type {string[]}
             */
            let index_entry = index[file_id][0].split('//')
            logger.debug(`next upload index entry for ${file_id} = ${index_entry}`)
            // local path
            next_upload.local_path = index_entry[0]
            // exif metadata
            if (index_entry.length > 1) {
                next_upload.exif_meta = JSON.parse(index_entry[1])
            }
            else {
                next_upload.exif_meta = null
            }

            logger.info(`next upload = ${JSON.stringify(next_upload)}`)
            res.send(next_upload)
        },
        (err) => {
            let message = `failed to fetch last upload. cannot assume next upload. ${err.stack}`
            logger.error(message)
            res.send({
                error: message
            })
        }
    )
})
server.get(URL_PATH_PHOTO_CONTENT, function(req, res) {
    // path relative to target dir
    let local_path = req.params['local_path']
    let abs_path = path.join(path.dirname(cli_args.targetDir), local_path)
    res.sendFile(abs_path)
})

server.listen(process.env.SERVER_PORT, () => {
    logger.info(
        `deployed face-manager at localhost:${process.env.SERVER_PORT}, serving local dir ${SERVER_DIR}`
    )
})

/**
 * 
 * @param {string} uploads_file_path 
 * 
 * @returns {{
 *  local_path: string,
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
 *  targetDir: string,
 *  sleep: boolean
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