import * as dotenv from 'dotenv'
import pino from 'pino'
import { URL, URLSearchParams, fileURLToPath } from 'node:url'
import * as fs from 'node:fs/promises'
import express from 'express'
import cors from 'cors'
import path from 'node:path'

const URL_PATH_AUTH_RESULT = '/authresult'
const URL_PATH_FACE_APP_ID = '/facebook-app-id'
const SERVER_DIR = path.dirname(fileURLToPath(import.meta.url))

const logger = pino().child({
    name: 'face-manager-server'
})

dotenv.config()
process.env.SERVER_PORT = process.env.SERVER_PORT || 80
logger.debug('loaded .env to process.env')

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

server.listen(process.env.SERVER_PORT, () => {
    logger.info(
        `deployed face-manager at localhost:${process.env.SERVER_PORT}, serving local dir ${SERVER_DIR}`
    )
})
