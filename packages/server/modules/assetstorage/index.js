const debug = require('debug')
const { contextMiddleware } = require('@/modules/shared')
const { getStream } = require('@/modules/core/services/streams')
const { Roles, Scopes } = require('@/modules/core/helpers/mainConstants')
const Busboy = require('busboy')
const {
  authMiddlewareCreator,
  validateServerRole,
  validateStreamRole,
  validateScope,
  contextRequiresStream
} = require('@/modules/shared/authz')
const {
  ensureStorageAccess,
  storeFileStream,
  getObjectStream,
  deleteObject,
  getObjectAttributes
} = require('./objectStorage')
const crs = require('crypto-random-string')
const {
  uploadFileStream,
  getFileStream,
  markUploadError,
  markUploadSuccess,
  markUploadOverFileSizeLimit,
  deleteAsset,
  objectLookup,
  getStreamBlobsMetadata
} = require('@/modules/assetstorage/services')
const {
  SpeckleNotFoundError,
  SpeckleResourceMismatch
} = require('@/modules/shared/errors')

const permissions = [
  validateServerRole({ requiredRole: Roles.Server.User }),
  validateScope({ requiredScope: Scopes.Streams.Write }),
  contextRequiresStream(getStream)
]
const writePermissions = [
  ...permissions,
  validateStreamRole({ requiredRole: Roles.Stream.Contributor })
]

const readPermissions = [
  ...permissions,
  validateStreamRole({ requiredRole: Roles.Stream.Contributor })
]

const ensureConditions = async () => {
  if (process.env.DISABLE_FILE_UPLOADS) {
    debug('speckle:modules')('📦 Blob storage is DISABLED')
    return
  } else {
    debug('speckle:modules')('📦 Init BlobStorage module')
    await ensureStorageAccess()
  }

  if (!process.env.S3_BUCKET) {
    debug('speckle:error')(
      'S3_BUCKET env variable was not specified. 📦 BlobStorage will be DISABLED.'
    )
    return
  }
}

const errorHandler = async (req, res, callback) => {
  try {
    await callback(req, res)
  } catch (err) {
    if (err instanceof SpeckleNotFoundError) {
      res.status(404).send({ error: err.message })
    } else if (err instanceof SpeckleResourceMismatch) {
      res.status(400).send({ error: err.message })
    } else {
      res.status(500).send({ error: err.message })
    }
  }
}

exports.init = async (app) => {
  await ensureConditions()
  // eslint-disable-next-line no-unused-vars
  app.post(
    '/api/stream/:streamId/blob',
    contextMiddleware,
    authMiddlewareCreator(writePermissions),
    async (req, res) => {
      // no checking of startup conditions, just dont init the endpoints if not configured right
      //authorize request
      const uploadOperations = {}
      const finalizePromises = []
      const busboy = Busboy({
        headers: req.headers,
        limits: { fileSize: 10_000_000_000 }
      })
      const streamId = req.params.streamId
      busboy.on('file', (name, file, info) => {
        const { filename: fileName } = info
        const fileType = fileName.split('.').pop().toLowerCase()

        const fileId = crs({ length: 10 })

        uploadOperations[fileId] = uploadFileStream(
          storeFileStream,
          { streamId, userId: req.context.userId },
          { fileId, fileName, fileType, fileStream: file }
        )

        //this file level 'close' is fired when a single file upload finishes
        //this way individual upload statuses can be updated, when done
        file.on('close', async () => {
          //this is handled by the file.on('limit', ...) event
          if (file.truncated) return
          await uploadOperations[fileId]
          finalizePromises.push(
            markUploadSuccess(getObjectAttributes, streamId, fileId)
          )
        })
        file.on('limit', () => {
          finalizePromises.push(
            markUploadOverFileSizeLimit(deleteObject, streamId, fileId)
          )
        })
        file.on('error', (err) => {
          console.log(err)
          finalizePromises.push(
            markUploadError(deleteObject, fileId, 'i need some error info here')
          )
        })
      })

      busboy.on('finish', async () => {
        // make sure all upload operations have been awaited,
        // otherwise the finish even can fire before all async operations finish
        //resulting in missing return values
        await Promise.all(Object.values(uploadOperations))
        // have to make sure all finalize promises have been awaited
        const uploadResults = await Promise.all(finalizePromises)
        res.status(201).send({ uploadResults })
      })

      busboy.on('error', (err) => {
        debug('speckle:error')(`File upload error: ${err}`)

        const status = 400
        const response = 'Upload request error. The server logs have more details'

        res.status(status).end(response)
      })

      req.pipe(busboy)
    }
  )

  app.get(
    '/api/stream/:streamId/blob/:blobId',
    contextMiddleware,
    authMiddlewareCreator(readPermissions),
    async (req, res) => {
      errorHandler(req, res, async (req, res) => {
        const fileInfo = await objectLookup({
          streamId: req.params.streamId,
          fileId: req.params.blobId
        })
        const fileStream = await getFileStream({
          getObjectStream,
          streamId: req.params.streamId,
          fileId: req.params.blobId
        })
        res.writeHead(200, {
          'Content-Type': 'application/octet-stream',
          'Content-Disposition': `attachment; filename="${fileInfo.fileName}"`
        })
        fileStream.pipe(res)
      })
    }
  )
  app.delete(
    '/api/stream/:streamId/blob/:blobId',
    contextMiddleware,
    authMiddlewareCreator(writePermissions),
    async (req, res) => {
      errorHandler(req, res, async (req, res) => {
        await deleteAsset({ streamId: req.params.streamId, fileId: req.params.blobId })
        res.status(204).send()
      })
    }
  )
  app.get(
    '/api/stream/:streamId/blobs',
    contextMiddleware,
    authMiddlewareCreator(writePermissions),
    async (req, res) => {
      const fileName = req.query.fileName

      errorHandler(req, res, async (req, res) => {
        const blobMetadataCollection = await getStreamBlobsMetadata({
          streamId: req.params.streamId,
          fileName
        })

        res.status(200).send({ files: blobMetadataCollection })
      })
    }
  )
  app.delete(
    '/api/stream/:streamId/blobs',
    contextMiddleware,
    authMiddlewareCreator(writePermissions)
    // async (req, res) => {}
  )
}

exports.finalize = () => {}
