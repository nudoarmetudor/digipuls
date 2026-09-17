// Files attached to evidence.
//
// Where they live. Not in the application folder: every deploy builds a fresh
// copy of the app in a new directory, so anything written beside the code
// would disappear with the next push. Not under the web root either: nothing
// here is served as a static file. They sit in a private directory in the
// hosting account's home (EVIDENCE_DIR overrides it), readable by the app
// alone, and reach a browser only through a route that checks who is asking —
// the school's own people, or a supervisor whose scope covers the school.
//
// What is accepted. A short list of document and image types, each checked
// against the file's first bytes rather than trusted from its name or from the
// browser's declared type, up to 10 MB. Stored under a random name; the name
// the school gave it is kept only as a label.

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');

const MAX_BYTES = 10 * 1024 * 1024;

// The account's home from the password database, not $HOME: the hosting
// starts the app with HOME set to the domain's own folder, which the host
// marks as not for uploads, while an SSH session sees the real home. Reading
// the account record makes both agree on one place.
function accountHome() {
  try {
    return os.userInfo().homedir || os.homedir();
  } catch (err) {
    return os.homedir();
  }
}

const STORAGE_DIR = process.env.EVIDENCE_DIR
  || path.join(accountHome(), 'digipuls-data', 'evidence');

const PDF = (b) => b.slice(0, 5).toString('latin1') === '%PDF-';
const PNG = (b) => b.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
const JPEG = (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
const WEBP = (b) => b.slice(0, 4).toString('latin1') === 'RIFF' && b.slice(8, 12).toString('latin1') === 'WEBP';
// Office Open XML and OpenDocument files are zip archives.
const ZIP = (b) => b[0] === 0x50 && b[1] === 0x4b && b[2] === 0x03 && b[3] === 0x04;
// The older Word, Excel and PowerPoint formats.
const OLE = (b) => b.slice(0, 8).equals(Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]));
// Plain text: no NUL bytes in the part we look at.
const TEXT = (b) => !b.slice(0, 8192).includes(0);

/** Extension -> the type it is served as, and the check its contents must pass. */
const TYPES = {
  pdf: { mime: 'application/pdf', sniff: PDF, inline: true },
  png: { mime: 'image/png', sniff: PNG, inline: true },
  jpg: { mime: 'image/jpeg', sniff: JPEG, inline: true },
  jpeg: { mime: 'image/jpeg', sniff: JPEG, inline: true },
  webp: { mime: 'image/webp', sniff: WEBP, inline: true },
  doc: { mime: 'application/msword', sniff: OLE },
  xls: { mime: 'application/vnd.ms-excel', sniff: OLE },
  ppt: { mime: 'application/vnd.ms-powerpoint', sniff: OLE },
  docx: { mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', sniff: ZIP },
  xlsx: { mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', sniff: ZIP },
  pptx: { mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', sniff: ZIP },
  odt: { mime: 'application/vnd.oasis.opendocument.text', sniff: ZIP },
  ods: { mime: 'application/vnd.oasis.opendocument.spreadsheet', sniff: ZIP },
  odp: { mime: 'application/vnd.oasis.opendocument.presentation', sniff: ZIP },
  txt: { mime: 'text/plain; charset=utf-8', sniff: TEXT },
  csv: { mime: 'text/csv; charset=utf-8', sniff: TEXT },
};

const ACCEPT = Object.keys(TYPES).map((e) => `.${e}`).join(',');

/**
 * What a file is, judged by its name *and* its contents, or null when the two
 * do not agree or the type is not on the list.
 */
function detectType(originalName, buffer) {
  const ext = path.extname(String(originalName || '')).slice(1).toLowerCase();
  const type = TYPES[ext];
  if (!type || !buffer || !buffer.length) return null;
  return type.sniff(buffer) ? { ext, mime: type.mime, inline: !!type.inline } : null;
}

/** A name safe to show and to put in a download header: no paths, no control characters. */
function cleanName(originalName) {
  const base = path.basename(String(originalName || 'file')).replace(/[\u0000-\u001f\u007f"\\/]/g, '_');
  return base.slice(0, 150) || 'file';
}

const STORED_NAME = /^[0-9a-f]{32}\.[a-z0-9]{2,5}$/;

async function storeFile(buffer, ext) {
  await fs.promises.mkdir(STORAGE_DIR, { recursive: true, mode: 0o700 });
  const stored = `${crypto.randomBytes(16).toString('hex')}.${ext}`;
  await fs.promises.writeFile(path.join(STORAGE_DIR, stored), buffer, { mode: 0o600, flag: 'wx' });
  return stored;
}

/** Deletes a stored file. A name that is not one of ours is ignored, never resolved. */
async function removeFile(stored) {
  if (!stored || !STORED_NAME.test(stored)) return;
  try {
    await fs.promises.unlink(path.join(STORAGE_DIR, stored));
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
  }
}

/**
 * Streams an evidence file to the browser. The caller has already decided the
 * person may see it.
 */
function sendFile(res, evidence) {
  const stored = evidence && evidence.filePath;
  if (!stored || !STORED_NAME.test(stored)) return false;
  const full = path.join(STORAGE_DIR, stored);
  if (!fs.existsSync(full)) return false;

  const ext = stored.split('.').pop();
  const type = TYPES[ext] || { mime: 'application/octet-stream' };
  const name = cleanName(evidence.fileName || stored);
  const disposition = type.inline ? 'inline' : 'attachment';
  res.setHeader('Content-Type', type.mime);
  res.setHeader('Content-Disposition',
    `${disposition}; filename="${name.replace(/[^\x20-\x7e]/g, '_')}"; filename*=UTF-8''${encodeURIComponent(name)}`);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  // Opened in the browser, a file is still content the school uploaded: it
  // runs no script and loads nothing. The production host replaces this
  // header with its own, so it is not what keeps a file harmless there — the
  // type list is: nothing that a browser would run as a page is accepted, the
  // contents must match the type, nosniff stops the browser guessing, and
  // everything but PDFs and images downloads rather than opens.
  res.setHeader('Content-Security-Policy', "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox");
  fs.createReadStream(full).pipe(res);
  return true;
}

/**
 * The upload itself: one file, held in memory up to the limit, parsed only
 * after the request has been matched to a signed-in school member.
 */
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_BYTES, files: 1, fields: 20 },
}).single('file');

function receiveFile(req, res, next) {
  upload(req, res, (err) => {
    if (!err) return next();
    req.uploadError = err.code === 'LIMIT_FILE_SIZE' ? 'file_size' : 'file_type';
    return next();
  });
}

function formatSize(bytes) {
  if (!Number.isFinite(bytes)) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

module.exports = {
  MAX_BYTES, STORAGE_DIR, TYPES, ACCEPT,
  detectType, cleanName, storeFile, removeFile, sendFile, receiveFile, formatSize,
};
