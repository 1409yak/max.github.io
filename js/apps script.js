/** 
 * MAX Messenger - Backend with Stickers System
 * Sheets:
 * - Users: username | pass_hash | created_at | bio | last_active | balance | stickers_owned
 * - Messages: id | timestamp | username | text | reply_to
 */

const USERS_SHEET = 'Users';
const MSGS_SHEET = 'Messages';
const MAX_MESSAGES_RETURN = 200;
const STICKER_COUNT = 100;
const INDIVIDUAL_STICKER_PRICE = 500;

function doGet(e) {
  const mode = (e.parameter.mode || '').toLowerCase();

  if (mode === 'messages') {
    const user = e.parameter.user || null;
    const messages = listMessages_(MAX_MESSAGES_RETURN, user);
    return jsonResponse_({ status: 'ok', messages });
  }

  return jsonResponse_({ 
    status: 'ok', 
    info: 'MAX Messenger API',
    endpoints: {
      GET: ['messages'],
      POST: [
        'register', 'login', 'send', 
        'uploadImage', 'getbio', 'savebio', 
        'getprofile', 'getallusers', 'heartbeat',
        'getbalance', 'addbalance', 'setbalance', 'pay',
        'getUserStickers', 'buySticker', 'buyStickerPack',
        'delete'
      ]
    }
  });
}

function doPost(e) {
  try {
    const params = e.parameter;
    const mode = params.mode;

    switch (mode) {
      /* ===== AUTH ===== */
      case 'login': {
        const username = params.username;
        const password = params.password;
        
        if (!username || !password) {
          throw new Error('Username and password required');
        }
        
        if (verify_(username, password)) {
          return jsonResponse_({ status: 'ok', message: 'Login successful' });
        } else {
          return jsonResponse_({ status: 'error', message: 'Invalid credentials' });
        }
      }

      case 'register': {
        const username = params.username;
        const password = params.password;
        
        if (!username || !password) {
          throw new Error('Username and password required');
        }
        
        try {
          register_(username, password);
          return jsonResponse_({ status: 'ok', message: 'Registration successful' });
        } catch (error) {
          return jsonResponse_({ status: 'error', message: error.message });
        }
      }

      /* ===== PROFILE ===== */
      case 'getAllProfiles': {
        const sheet = getSheet_(USERS_SHEET);
        const rows = sheet.getDataRange().getValues();
        const profiles = rows.slice(1).map(r => ({
          username: r[0],
          created_at: r[2],
          bio: r[3] || '',
          last_active: r[4] || '',
          balance: Number(r[5] || 0),
          stickers_owned: r[6] || ''
        }));
        return jsonResponse_({ status: 'ok', profiles });
      }

      case 'getprofile': {
        const u = params.username;
        const profile = getProfile_(u);
        return jsonResponse_({ status: 'ok', profile });
      }

      case 'setProfilePicture': {
        const u = params.username;
        const p = params.password;
        const pictureName = params.picture_name;
        
        if (!verify_(u, p)) throw new Error('Invalid credentials');
        if (!pictureName) throw new Error('Picture name required');
        
        // Validate picture name format (e.g., "001.png", "045.png")
        if (!pictureName.match(/^\d{3}\.png$/)) {
          throw new Error('Invalid picture name format');
        }
        
        setProfilePicture_(u, pictureName);
        return jsonResponse_({ status: 'ok', message: 'Profile picture updated' });
      }

      case 'getProfilePicture': {
        const u = params.username;
        const profile = getProfile_(u);
        return jsonResponse_({ 
          status: 'ok', 
          profile_picture: profile.profile_picture || '001.png' // Default to first picture
        });
      }

      case 'getBio': {
        const u = params.username;
        const p = params.password;
        if (!verify_(u, p)) throw new Error('Invalid credentials');
        const profile = getProfile_(u);
        return jsonResponse_({ status: 'ok', bio: profile.bio });
      }

      case 'saveBio': {
        const u = params.username;
        const p = params.password;
        if (!verify_(u, p)) throw new Error('Invalid credentials');

        const row = findUserRow_(u);
        if (!row) throw new Error('User not found');

        const sheet = getSheet_(USERS_SHEET);
        sheet.getRange(row, 4).setValue(params.bio || ''); // col 4 = bio
        return jsonResponse_({ status: 'ok' });
      }

      /* ===== ECONOMY ===== */
      case 'getbalance': {
        const u = params.username;
        const p = params.password;
        if (!verify_(u, p)) throw new Error('Invalid credentials');
        return jsonResponse_({ status: 'ok', balance: getBalance_(u) });
      }

      case 'addbalance': {
        const u = params.username;
        const p = params.password;
        if (!verify_(u, p)) throw new Error('Invalid credentials');
        const amount = Number(params.amount || 0);
        if (isNaN(amount)) throw new Error('Invalid amount');
        return jsonResponse_({ status: 'ok', balance: addBalance_(u, amount) });
      }

      case 'setbalance': {
        const u = params.username;
        const p = params.password;
        if (!verify_(u, p)) throw new Error('Invalid credentials');
        const newBal = Number(params.amount || 0);
        if (isNaN(newBal)) throw new Error('Invalid amount');
        return jsonResponse_({ status: 'ok', balance: setBalance_(u, newBal) });
      }

      case 'pay': {
        const fromUser = params.username;
        const pass = params.password;
        const toUser = params.to;
        const amount = Number(params.amount || 0);

        if (!verify_(fromUser, pass)) throw new Error('Invalid credentials');
        if (!toUser) throw new Error('Missing recipient');
        if (isNaN(amount) || amount <= 0) throw new Error('Invalid amount');

        const fromBal = getBalance_(fromUser);
        if (fromBal < amount) throw new Error('Insufficient funds');

        // Deduct from sender
        setBalance_(fromUser, fromBal - amount);

        // Add to recipient
        addBalance_(toUser, amount);

        return jsonResponse_({
          status: 'ok',
          from: fromUser,
          to: toUser,
          amount,
          newBalance: fromBal - amount
        });
      }

      /* ===== STICKERS ===== */
      case 'getUserStickers': {
        const u = params.username;
        const p = params.password;
        if (!verify_(u, p)) throw new Error('Invalid credentials');
        
        const stickers = getUserStickers_(u);
        return jsonResponse_({ status: 'ok', stickers });
      }

      case 'buySticker': {
        const u = params.username;
        const p = params.password;
        const stickerName = params.sticker_name;
        
        if (!verify_(u, p)) throw new Error('Invalid credentials');
        if (!stickerName) throw new Error('Sticker name required');

        // Validate sticker name format (e.g., "001.png", "045.png", "100.png")
        if (!stickerName.match(/^\d{3}\.png$/)) {
          throw new Error('Invalid sticker name format');
        }

        // Check if user already owns this sticker
        const ownedStickers = getUserStickers_(u);
        if (ownedStickers.includes(stickerName)) {
          throw new Error('You already own this sticker');
        }

        // Check balance
        const userBalance = getBalance_(u);
        if (userBalance < INDIVIDUAL_STICKER_PRICE) {
          throw new Error('Not enough coins. Stickers cost 500 coins each.');
        }

        // Deduct coins and add sticker to user's collection
        setBalance_(u, userBalance - INDIVIDUAL_STICKER_PRICE);
        addStickerToUser_(u, stickerName);

        return jsonResponse_({ 
          status: 'ok', 
          message: 'Sticker purchased!',
          newBalance: userBalance - INDIVIDUAL_STICKER_PRICE
        });
      }

      /* ===== MESSAGES ===== */
      case 'send': {
        const u = params.username;
        const p = params.password;
        const text = params.text;
        const replyTo = params.reply_to;
        
        if (!verify_(u, p)) throw new Error('Invalid credentials');
        if (!text || text.length > 500) throw new Error('Message must be 1-500 characters');
        
        // Check if user is muted
        if (isUserMuted_(u)) {
          return jsonResponse_({ status: 'error', message: 'You are muted and cannot send messages' });
        }
        
        const id = appendMessage_(u, text, replyTo);
        return jsonResponse_({ status: 'ok', id });
      }

      case 'uploadImage': {
        const u = params.username;
        const p = params.password;
        const fileData = params.file;
        const fileName = params.name;
        const fileType = params.type;
        const replyTo = params.reply_to;
        
        if (!verify_(u, p)) throw new Error('Invalid credentials');
        if (!fileData) throw new Error('No file data');
        
        // Check if user is muted
        if (isUserMuted_(u)) {
          return jsonResponse_({ status: 'error', message: 'You are muted and cannot send messages' });
        }
        
        try {
          const imageUrl = handleImageUpload_({
            file: fileData,
            name: fileName,
            type: fileType
          });
          
          const id = appendMessage_(u, `IMAGE::${imageUrl}`, replyTo);
          
          return jsonResponse_({ 
            status: 'ok', 
            id,
            imageUrl 
          });
        } catch (error) {
          return jsonResponse_({ 
            status: 'error', 
            message: error.message 
          });
        }
      }

      case 'sendPrivate': {
        const u = params.username;
        const p = params.password;
        const text = params.text;
        const replyTo = params.reply_to;
        const sendTo = params.send_to;
        
        if (!verify_(u, p)) throw new Error('Invalid credentials');
        if (!text || text.length > 500) throw new Error('Message must be 1-500 characters');
        if (!sendTo) throw new Error('Recipient required for private messages');
        
        // Check if user is muted
        if (isUserMuted_(u)) {
          return jsonResponse_({ status: 'error', message: 'You are muted and cannot send messages' });
        }
        
        const id = appendPrivateMessage_(u, text, replyTo, sendTo);
        return jsonResponse_({ status: 'ok', id });
      }

      case 'uploadPrivateImage': {
        const u = params.username;
        const p = params.password;
        const fileData = params.file;
        const fileName = params.name;
        const fileType = params.type;
        const replyTo = params.reply_to;
        const sendTo = params.send_to;

        if (!verify_(u, p)) throw new Error('Invalid credentials');
        if (!fileData) throw new Error('No file data');
        if (!sendTo) throw new Error('Recipient required');

        if (isUserMuted_(u)) {
          return jsonResponse_({ status: 'error', message: 'You are muted and cannot send messages' });
        }

        const imageUrl = handleImageUpload_({ file: fileData, name: fileName, type: fileType });

        const id = appendPrivateMessage_(u, `IMAGE::${imageUrl}`, replyTo, sendTo);

        return jsonResponse_({ status: 'ok', id, imageUrl });
      }



      case 'delete': {
        const u = params.username;
        const p = params.password;
        const messageId = params.message_id;
        
        if (!verify_(u, p)) throw new Error('Invalid credentials');
        if (!messageId) throw new Error('Message ID required');
        
        deleteMessage_(u, messageId);
        return jsonResponse_({ status: 'ok', message: 'Message deleted successfully' });
      }

      case 'addCoins': {
        const u = params.username;
        const amount = Number(params.amount || 1);
        if (isNaN(amount)) throw new Error('Invalid amount');
        return jsonResponse_({ status: 'ok', balance: addBalance_(u, amount) });
      }

      default:
        throw new Error('Unknown mode: ' + mode);
    }

  } catch (err) {
    return jsonResponse_({ status: 'error', message: err.message });
  }
}

/* ===== CORE FUNCTIONS ===== */

function getSheet_(name) {
  const ss = SpreadsheetApp.getActive();
  let sheet = ss.getSheetByName(name);
  
  if (!sheet) {
    sheet = ss.insertSheet(name);
    if (name === USERS_SHEET) {
      sheet.getRange(1, 1, 1, 7)
        .setValues([['username', 'pass_hash', 'created_at', 'bio', 'last_active', 'balance', 'stickers_owned']]);
    } else if (name === MSGS_SHEET) {
      // UPDATE THIS LINE - ADD send_to AS COLUMN 6
      sheet.getRange(1, 1, 1, 6)
        .setValues([['id', 'timestamp', 'username', 'text', 'reply_to', 'send_to']]);
    }
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function sha256Hex_(str) {
  const bytes = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    str,
    Utilities.Charset.UTF_8
  );
  return bytes.map(b => ((b < 0 ? b + 256 : b).toString(16).padStart(2, '0'))).join('');
}

function usernameValid_(username) {
  return /^[A-Za-z0-9_]{3,20}$/.test(username || '');
}

function findUserRow_(username) {
  const sheet = getSheet_(USERS_SHEET);
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return null;
  
  const usernames = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
  for (let i = 0; i < usernames.length; i++) {
    if (String(usernames[i][0]) === username) return i + 2;
  }
  return null;
}

function isUserMuted_(username) {
  const row = findUserRow_(username);
  if (!row) return false;
  
  const sheet = getSheet_(USERS_SHEET);
  // Changed from column 8 to column 9 for mute
  const muteValue = String(sheet.getRange(row, 9).getValue() || '').toLowerCase();
  return muteValue === 'true';
}

function updateLastActive_(username) {
  const row = findUserRow_(username);
  if (row) {
    getSheet_(USERS_SHEET)
      .getRange(row, 5)
      .setValue(new Date().toISOString());
  }
}

/* ==== CRYPTO HELPERS ==== */
function getHoldingsSheet_() {
  return getSheet_('Holdings');
}

function addHolding_(u, symbol, amount, cost) {
  const sheet = getHoldingsSheet_();
  const rows = sheet.getDataRange().getValues();
  let row = rows.findIndex(r => r[0] === u && r[1] === symbol);
  if (row > 0) {
    // update existing
    const oldAmount = Number(rows[row][2] || 0);
    const oldCost = Number(rows[row][3] || 0);
    sheet.getRange(row+1, 3).setValue(oldAmount + amount);
    sheet.getRange(row+1, 4).setValue(oldCost + cost);
  } else {
    sheet.appendRow([u, symbol, amount, cost]);
  }
}

function removeHolding_(u, symbol, amount) {
  const sheet = getHoldingsSheet_();
  const rows = sheet.getDataRange().getValues();
  for (let i=1; i<rows.length; i++) {
    if (rows[i][0] === u && rows[i][1] === symbol) {
      const oldAmount = Number(rows[i][2]);
      const oldCost = Number(rows[i][3]);
      if (oldAmount < amount) return false;

      const newAmount = oldAmount - amount;
      const avg = oldCost / oldAmount;
      const newCost = newAmount * avg;

      sheet.getRange(i+1, 3).setValue(newAmount);
      sheet.getRange(i+1, 4).setValue(newCost);
      return true;
    }
  }
  return false;
}

function getHoldings_(u) {
  const sheet = getHoldingsSheet_();
  const rows = sheet.getDataRange().getValues();
  return rows.slice(1).filter(r => r[0] === u).map(r => ({
    symbol: r[1],
    amount: Number(r[2]),
    total_cost: Number(r[3])
  }));
}

// Simulated/random price generator
function getSimulatedPrice_(symbol) {
  const base = { BTC: 10000, ETH: 500, DOGE: 0.1 }[symbol] || 100;
  return base * (0.8 + Math.random() * 0.4); // random +/-20%
}

/* ===== AUTH FUNCTIONS ===== */

function register_(username, password) {
  if (!usernameValid_(username)) {
    throw new Error('Invalid username (3-20 chars, A-Z, 0-9, _)');
  }
  if (!password || password.length < 4) {
    throw new Error('Password must be at least 4 characters');
  }
  if (findUserRow_(username)) {
    throw new Error('Username already exists');
  }

  const hash = sha256Hex_(password);
  const now = new Date().toISOString();
  
  getSheet_(USERS_SHEET)
    .appendRow([username, hash, now, '', now, 0, '']); // Added balance and stickers_owned columns
}

function verify_(username, password) {
  const row = findUserRow_(username);
  if (!row) return false;
  
  const sheet = getSheet_(USERS_SHEET);
  const storedHash = String(sheet.getRange(row, 2).getValue() || '');
  const inputHash = sha256Hex_(password);
  
  if (storedHash === inputHash) {
    updateLastActive_(username);
    return true;
  }
  return false;
}

/* ===== PROFILE FUNCTIONS ===== */

function getProfile_(username) {
  const row = findUserRow_(username);
  if (!row) throw new Error('User not found');

  const sheet = getSheet_(USERS_SHEET);
  const lastColumn = sheet.getLastColumn();
  const data = sheet.getRange(row, 1, 1, Math.max(8, lastColumn)).getValues()[0];

  return {
    username: data[0],
    created_at: data[2],
    bio: data[3] || '',
    last_active: data[4] || '',
    balance: Number(data[5] || 0),
    stickers_owned: data[6] || '',
    profile_picture: data[7] || '001.png' // Default to first picture
  };
}

function setProfilePicture_(username, pictureName) {
  const row = findUserRow_(username);
  if (!row) throw new Error('User not found');
  
  const sheet = getSheet_(USERS_SHEET);
  
  // Check if column 8 exists, if not create it
  const lastColumn = sheet.getLastColumn();
  if (lastColumn < 8) {
    sheet.getRange(1, 8).setValue('profile_picture');
  }
  
  sheet.getRange(row, 8).setValue(pictureName);
}


function getBalance_(username) {
  const row = findUserRow_(username);
  if (!row) throw new Error('User not found');
  const sheet = getSheet_(USERS_SHEET);
  return Number(sheet.getRange(row, 6).getValue() || 0);
}

function setBalance_(username, amount) {
  const row = findUserRow_(username);
  if (!row) throw new Error('User not found');
  const sheet = getSheet_(USERS_SHEET);
  sheet.getRange(row, 6).setValue(amount);
  return amount;
}

function addBalance_(username, delta) {
  const current = getBalance_(username);
  const newBal = current + delta;
  return setBalance_(username, newBal);
}

/* ===== STICKER FUNCTIONS ===== */

function getUserStickers_(username) {
  const row = findUserRow_(username);
  if (!row) return [];
  
  const sheet = getSheet_(USERS_SHEET);
  const stickersValue = sheet.getRange(row, 7).getValue(); // Column 7 is stickers_owned
  
  if (!stickersValue) return [];
  
  // Parse comma-separated sticker names
  return stickersValue.split(',').map(s => s.trim()).filter(s => s !== '');
}

function addStickerToUser_(username, stickerName) {
  const row = findUserRow_(username);
  if (!row) throw new Error('User not found');
  
  const sheet = getSheet_(USERS_SHEET);
  const currentStickers = getUserStickers_(username);
  
  // Don't add duplicate stickers
  if (!currentStickers.includes(stickerName)) {
    currentStickers.push(stickerName);
    sheet.getRange(row, 7).setValue(currentStickers.join(','));
  }
}

/* ===== MESSAGE FUNCTIONS ===== */

function generateMessageId_() {
  return 'm' + Date.now() + '_' + Math.floor(Math.random() * 1000);
}

function appendMessage_(username, text, replyTo) {
  const id = generateMessageId_();
  const iso = new Date().toISOString();
  getSheet_(MSGS_SHEET)
    .appendRow([id, iso, username, text, replyTo || '']);
  updateLastActive_(username);

  // Award 1 coin for sending a message
  addBalance_(username, 5);

  return id;
}

function appendPrivateMessage_(username, text, replyTo, sendTo) {
  const id = generateMessageId_();
  const iso = new Date().toISOString();
  getSheet_(MSGS_SHEET)
    .appendRow([id, iso, username, text, replyTo || '', sendTo]);
  updateLastActive_(username);

  // Award 1 coin for sending a message
  addBalance_(username, 5);

  return id;
}

function listMessages_(limit, requestingUser = null) {
  const sheet = getSheet_(MSGS_SHEET);
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  
  const count = Math.min(limit || MAX_MESSAGES_RETURN, lastRow - 1);
  const startRow = Math.max(2, lastRow - count + 1);

  // First, check how many columns we actually have
  const lastColumn = sheet.getLastColumn();
  const numColumns = Math.min(6, lastColumn); // Don't try to get more columns than exist
  
  // Get the available columns
  const rows = sheet.getRange(startRow, 1, count, numColumns).getValues();

  // Convert to objects
  const msgs = rows.map(r => {
    // Skip empty rows
    if (!r[0] && !r[2] && !r[3]) return null;
    
    const tsVal = r[1];
    const tsMs = tsVal instanceof Date ? tsVal.getTime() : Date.parse(tsVal);
    const replyTo = String(r[4] || '').trim();
    const sendTo = numColumns >= 6 ? String(r[5] || '').trim() : ''; // Safe access to column 6
    
    return {
      id: String(r[0]),
      ts: tsMs,
      username: String(r[2]),
      text: String(r[3]),
      reply_to: replyTo,
      send_to: sendTo,
      reply_preview: null
    };
  }).filter(msg => msg !== null);

  // Filter messages based on requesting user
  const filteredMsgs = msgs.filter(msg => {
    // Show public messages (no send_to)
    if (!msg.send_to) return true;
    
    // Show private messages where user is either sender or recipient
    if (requestingUser && (msg.username === requestingUser || msg.send_to === requestingUser)) {
      return true;
    }
    
    return false;
  });

  // Add reply previews
  for (let i = 0; i < filteredMsgs.length; i++) {
    const m = filteredMsgs[i];
    const parentId = m.reply_to;
    
    if (!parentId) continue;

    // Try to find parent in current batch
    let parent = filteredMsgs.find(msg => msg.id === parentId);
    
    // If not found, search the entire sheet
    if (!parent) {
      parent = findMessageById_(parentId);
    }

    if (parent) {
      m.reply_preview = {
        id: parent.id,
        username: parent.username,
        text: parent.text.length > 50 ? parent.text.substring(0, 47) + '...' : parent.text
      };
    }
  }

  return filteredMsgs;
}

function findMessageById_(id) {
  if (!id) return null;
  const sheet = getSheet_(MSGS_SHEET);
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return null;

  const rows = sheet.getRange(2, 1, lastRow - 1, 5).getValues();
  for (let r of rows) {
    if (String(r[0]) === id) {
      const ts = r[1] instanceof Date ? r[1].getTime() : Date.parse(r[1]);
      return {
        id: String(r[0]),
        ts,
        username: String(r[2]),
        text: String(r[3]),
        reply_to: String(r[4] || '')
      };
    }
  }
  return null;
}

/* ===== HELPER FUNCTIONS ===== */

function jsonResponse_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

/* ===== IMAGE UPLOAD FUNCTIONS ===== */

function handleImageUpload_(params) {
  const folderName = "MAX_Messenger_Uploads";
  const folder = getOrCreateFolder_(folderName);

  if (!params.file) throw new Error("No file data");

  const decoded = Utilities.base64Decode(params.file);
  const blob = Utilities.newBlob(
    decoded,
    params.type || "image/png",
    params.name || ("upload_" + Date.now() + ".png")
  );

  const file = folder.createFile(blob);
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

  const fileId = file.getId();
  return `https://drive.google.com/file/d/${fileId}`;
}

function getOrCreateFolder_(name) {
  const folders = DriveApp.getFoldersByName(name);
  if (folders.hasNext()) return folders.next();
  return DriveApp.createFolder(name);
}

function getOrCreateFolder_(name) {
  const folders = DriveApp.getFoldersByName(name);
  if (folders.hasNext()) return folders.next();
  return DriveApp.createFolder(name);
}

/* ===== MESSAGE DELETION FUNCTIONS ===== */

function deleteMessage_(username, messageId) {
  const sheet = getSheet_(MSGS_SHEET);
  const lastRow = sheet.getLastRow();
  
  if (lastRow < 2) {
    throw new Error('No messages found');
  }
  
  // Find the message to delete
  const ids = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
  let rowToDelete = -1;
  
  for (let i = 0; i < ids.length; i++) {
    if (String(ids[i][0]) === messageId) {
      // Check if user owns it
      const messageUsername = sheet.getRange(i + 2, 3).getValue();
      if (messageUsername === username) {
        rowToDelete = i + 2;
        break;
      } else {
        throw new Error('You can only delete your own messages');
      }
    }
  }
  
  if (rowToDelete === -1) {
    throw new Error('Message not found');
  }
  
  // If it's an image message, delete the file from Google Drive
  const messageText = sheet.getRange(rowToDelete, 4).getValue();
  if (messageText && messageText.startsWith("IMAGE::")) {
    try {
      const fileUrl = messageText.replace("IMAGE::", "");
      const fileId = extractFileIdFromUrl_(fileUrl);
      if (fileId) {
        const file = DriveApp.getFileById(fileId);
        file.setTrashed(true);
      }
    } catch (e) {
      console.warn('Could not delete image file:', e.message);
    }
  }
  
  // If it's a sticker message, delete the file from Google Drive
  if (messageText && messageText.startsWith("STICKER::")) {
    try {
      const fileUrl = messageText.replace("STICKER::", "");
      const fileId = extractFileIdFromUrl_(fileUrl);
      if (fileId) {
        const file = DriveApp.getFileById(fileId);
        file.setTrashed(true);
      }
    } catch (e) {
      console.warn('Could not delete sticker file:', e.message);
    }
  }
  
  // Delete the message row
  sheet.deleteRow(rowToDelete);
  
  return true;
}

function extractFileIdFromUrl_(url) {
  const patterns = [
    /\/file\/d\/([a-zA-Z0-9_-]+)/,
    /id=([a-zA-Z0-9_-]+)/,
    /\/thumbnail\?id=([a-zA-Z0-9_-]+)/
  ];
  
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match && match[1]) {
      return match[1];
    }
  }
  return null;
}