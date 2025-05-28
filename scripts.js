if (!window.crypto.subtle) {
  alert('Web Crypto API not supported. Please use a modern browser.');
  throw new Error('Web Crypto API unavailable');
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();

async function deriveKey(password, salt) {
  try {
    const keyMaterial = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveKey']);
    return crypto.subtle.deriveKey(
      { name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' },
      keyMaterial,
      { name: 'AES-GCM', length: 256 },
      true,
      ['encrypt', 'decrypt']
    );
  } catch (e) {
    console.error('Key derivation error:', e);
    throw new Error('Failed to derive encryption key.');
  }
}

async function encryptMessage(message, key) {
  try {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoder.encode(message));
    return { iv: Array.from(iv), data: Array.from(new Uint8Array(encrypted)) };
  } catch (e) {
    console.error('Encryption error:', e);
    throw new Error('Failed to encrypt message.');
  }
}

async function decryptMessage(encrypted, key) {
  try {
    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: new Uint8Array(encrypted.iv) },
      key,
      new Uint8Array(encrypted.data)
    );
    return decoder.decode(decrypted);
  } catch (e) {
    console.error('Decryption error:', e);
    return '[Decryption failed]';
  }
}

const state = {
  currentRoom: null,
  key: null,
  nickname: null,
  messageLimit: 50,
  ws: null,
};

function getElements() {
  return {
    welcomeScreen: document.querySelector('#welcome-screen'),
    createRoom: document.querySelector('#create-room'),
    createRoomForm: document.querySelector('#create-room-form'),
    joinRoomScreen: document.querySelector('#join-room'),
    joinRoomForm: document.querySelector('#join-room-form'),
    chatRoom: document.querySelector('#chat-room'),
    createRoomToggle: document.querySelector('#create-room-toggle'),
    createRoomFormContainer: document.querySelector('#create-room-form-container'),
    roomNameInput: document.querySelector('#room-name'),
    nicknameInput: document.querySelector('#nickname'),
    passwordInput: document.querySelector('#password'),
    generateLinkBtn: document.querySelector('#generate-link'),
    joinRoomTitle: document.querySelector('#join-room-title'),
    joinPasswordInput: document.querySelector('#join-password'),
    joinNicknameInput: document.querySelector('#join-nickname'),
    joinRoomSubmitBtn: document.querySelector('#join-room-submit'),
    roomTitle: document.querySelector('#room-title'),
    nicknameDisplay: document.querySelector('#nickname-display'),
    copyLinkBtn: document.querySelector('#copy-link'),
    leaveRoomBtn: document.querySelector('#leave-room'),
    messagesDiv: document.querySelector('#messages'),
    loadMoreBtn: document.querySelector('#load-more'),
    messageForm: document.querySelector('#message-form'),
    inputMessage: document.querySelector('#input-message'),
    sendBtn: document.querySelector('#send-btn'),
    createError: document.querySelector('#create-error'),
    createSuccess: document.querySelector('#create-success'),
    createLoading: document.querySelector('#create-loading'),
    joinError: document.querySelector('#join-error'),
    joinLoading: document.querySelector('#join-loading'),
    chatError: document.querySelector('#chat-error'),
    chatSuccess: document.querySelector('#chat-success'),
    roomList: document.querySelector('#room-list'),
    noRooms: document.querySelector('#no-rooms'),
  };
}

async function checkStorageAvailability() {
  try {
    await localforage.setItem('test', 'test');
    await localforage.removeItem('test');
    return true;
  } catch (e) {
    console.error('Storage unavailable:', e);
    return false;
  }
}

async function retryOperation(operation, maxRetries = 3, delay = 100) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (e) {
      console.warn(`Attempt ${attempt} failed:`, e);
      if (attempt === maxRetries) throw e;
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
}

async function loadRooms() {
  const elements = getElements();
  if (!elements.roomList || !elements.noRooms) return;
  elements.roomList.innerHTML = '';
  try {
    const keys = await localforage.keys();
    const rooms = [];
    for (const key of keys) {
      if (key.startsWith('room-')) {
        const data = await localforage.getItem(key);
        if (data && data.name) {
          const [, id] = key.split('room-');
          rooms.push({ id, name: data.name });
        }
      }
    }
    if (rooms.length === 0) {
      elements.noRooms.classList.remove('hidden');
      elements.roomList.innerHTML = '';
    } else {
      elements.noRooms.classList.add('hidden');
      rooms.forEach(room => {
        const div = document.createElement('div');
        div.className = `room-item ${state.currentRoom?.id === room.id ? 'active' : ''}`;
        div.textContent = room.name;
        div.title = room.name;
        div.setAttribute('role', 'button');
        div.setAttribute('tabindex', '0');
        div.addEventListener('click', () => {
          state.currentRoom = { id: room.id, name: room.name };
          const storedNickname = localStorage.getItem(`nickname-${room.id}`);
          const storedPassword = localStorage.getItem(`password-${room.id}`);
          if (storedNickname && storedPassword) {
            state.nickname = storedNickname;
            joinRoom(storedNickname, storedPassword);
          } else {
            window.location.href = `join.html#${btoa(`${room.id}:${room.name}`)}`;
          }
        });
        div.addEventListener('keydown', e => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            div.click();
          }
        });
        elements.roomList.appendChild(div);
      });
    }
  } catch (e) {
    console.error('Error loading rooms:', e);
    elements.noRooms.classList.remove('hidden');
  }
}

async function renderMessage(msg, elements) {
  let decrypted;
  try {
    decrypted = await decryptMessage({ iv: msg.iv, data: msg.data }, state.key);
  } catch (e) {
    console.error('Decryption failed for message:', msg, e);
    decrypted = '[Decryption failed]';
  }
  const isMe = msg.nickname === state.nickname;
  const messageEl = document.createElement('div');
  messageEl.className = `message ${isMe ? 'self' : ''}`;
  const avatarEl = document.createElement('div');
  avatarEl.className = 'avatar';
  avatarEl.textContent = msg.nickname ? msg.nickname.slice(0, 1).toUpperCase() : '?';
  const contentEl = document.createElement('div');
  contentEl.className = 'content';
  const authorEl = document.createElement('div');
  authorEl.className = 'author';
  authorEl.textContent = msg.nickname || 'Anonymous';
  const textEl = document.createElement('div');
  textEl.className = 'text';
  textEl.textContent = decrypted;
  const timeEl = document.createElement('div');
  timeEl.className = 'time';
  timeEl.textContent = dateFns.formatDistanceToNow(new Date(msg.time), { addSuffix: true });
  contentEl.appendChild(authorEl);
  contentEl.appendChild(textEl);
  contentEl.appendChild(timeEl);
  messageEl.appendChild(avatarEl);
  messageEl.appendChild(contentEl);
  elements.messagesDiv.appendChild(messageEl);
  elements.messagesDiv.scrollTop = elements.messagesDiv.scrollHeight;
}

function connectWebSocket(roomId, elements) {
  state.ws = new WebSocket('ws://localhost:8080');
  state.ws.onopen = () => {
    state.ws.send(JSON.stringify({ type: 'join', roomId }));
  };
  state.ws.onmessage = async event => {
    try {
      const data = JSON.parse(event.data);
      if (data.type === 'messages') {
        elements.messagesDiv.innerHTML = '';
        for (const msg of data.messages) {
          await renderMessage(msg, elements);
        }
      } else if (data.type === 'message') {
        await renderMessage(data.message, elements);
      } else if (data.type === 'room_deleted') {
        elements.chatError.textContent = 'Room has been deleted.';
        elements.chatError.style.display = 'block';
        leaveRoom();
      }
    } catch (e) {
      console.error('WebSocket message error:', e);
      elements.chatError.textContent = 'Error receiving message.';
      elements.chatError.style.display = 'block';
    }
  };
  state.ws.onerror = () => {
    elements.chatError.textContent = 'Failed to connect to server. Please try again.';
    elements.chatError.style.display = 'block';
  };
  state.ws.onclose = () => {
    state.ws = null;
  };
}

async function leaveRoom() {
  const elements = getElements();
  if (state.currentRoom) {
    try {
      await localforage.removeItem(`room-${state.currentRoom.id}`);
      if (state.ws) {
        state.ws.send(JSON.stringify({ type: 'leave', roomId: state.currentRoom.id }));
        state.ws.close();
      }
      localStorage.removeItem(`nickname-${state.currentRoom.id}`);
      localStorage.removeItem(`password-${state.currentRoom.id}`);
    } catch (e) {
      console.error('Error deleting room:', e);
    }
  }
  state.currentRoom = null;
  state.key = null;
  state.nickname = null;
  state.messageLimit = 50;
  state.ws = null;
  if (elements.chatRoom) {
    elements.chatRoom.style.display = 'none';
    elements.messagesDiv.innerHTML = '';
    elements.chatError.style.display = 'none';
    elements.chatSuccess.style.display = 'none';
  }
  window.location.assign('index.html');
}

async function joinRoom(nickname, password) {
  const elements = getElements();
  try {
    const roomData = await localforage.getItem(`room-${state.currentRoom.id}`);
    if (!roomData) {
      if (elements.joinError) {
        elements.joinError.textContent = 'Room not found. It may have expired.';
        elements.joinError.style.display = 'block';
        elements.joinError.focus();
      }
      return false;
    }
    state.key = await deriveKey(password, new Uint8Array(roomData.salt));
    state.nickname = nickname;
    localStorage.setItem(`nickname-${state.currentRoom.id}`, nickname);
    localStorage.setItem(`password-${state.currentRoom.id}`, password);
    window.location.href = `chat.html#${encodeURIComponent(btoa(`${state.currentRoom.id}:${state.currentRoom.name}`))}`;
    return true;
  } catch (e) {
    console.error('Join error:', e);
    if (elements.joinError) {
      elements.joinError.textContent = 'Incorrect password or error joining room. Try again.';
      elements.joinError.style.display = 'block';
      elements.joinError.focus();
    }
    return false;
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  const elements = getElements();

  if (elements.createRoom || elements.welcomeScreen) {
    if (elements.createRoomToggle) {
      elements.createRoomToggle.addEventListener('click', () => {
        const isExpanded = elements.createRoomToggle.getAttribute('aria-expanded') === 'true';
        elements.createRoomToggle.setAttribute('aria-expanded', !isExpanded);
        elements.createRoomFormContainer.classList.toggle('hidden');
        if (!isExpanded) {
          elements.welcomeScreen.classList.add('hidden');
          elements.roomNameInput.focus();
          elements.createError.style.display = 'none';
          elements.createSuccess.style.display = 'none';
        } else {
          elements.welcomeScreen.classList.remove('hidden');
        }
      });
    }

    if (elements.createRoomForm) {
      elements.createRoomForm.addEventListener('submit', async e => {
        e.preventDefault();
        const name = elements.roomNameInput.value.trim();
        const nickname = elements.nicknameInput.value.trim() || 'Anonymous';
        const password = elements.passwordInput.value.trim();

        if (!name || !password) {
          elements.createError.textContent = 'Room name and password are required.';
          elements.createError.style.display = 'block';
          elements.createError.focus();
          return;
        }

        if (!(await checkStorageAvailability())) {
          elements.createError.textContent = 'Storage unavailable. Clear browser storage (F12 > Application > Storage).';
          elements.createError.style.display = 'block';
          elements.createError.focus();
          return;
        }

        elements.generateLinkBtn.disabled = true;
        elements.createLoading.style.display = 'block';
        elements.createError.style.display = 'none';
        elements.createSuccess.style.display = 'none';

        try {
          state.currentRoom = null;
          state.key = null;
          state.nickname = null;

          const id = crypto.randomUUID();
          const salt = crypto.getRandomValues(new Uint8Array(16));
          const key = await deriveKey(password, salt);

          const roomData = {
            salt: Array.from(salt),
            name,
            created: Date.now(),
          };

          await retryOperation(() => localforage.setItem(`room-${id}`, roomData));

          state.currentRoom = { id, name };
          state.nickname = nickname;
          state.key = key;

          localStorage.setItem(`nickname-${id}`, nickname);
          localStorage.setItem(`password-${id}`, password);

          elements.createSuccess.textContent = 'Room created!';
          elements.createSuccess.style.display = 'block';
          elements.createSuccess.focus();

          elements.createRoomForm.reset();
          elements.createRoomToggle.setAttribute('aria-expanded', 'false');
          elements.createRoomFormContainer.classList.add('hidden');
          elements.welcomeScreen.classList.remove('hidden');

          await loadRooms();
          window.location.href = `chat.html#${encodeURIComponent(btoa(`${id}:${name}`))}`;
        } catch (e) {
          console.error('Create room error:', e);
          elements.createError.textContent = 'Failed to create room. Try again or clear storage (F12 > Application > Storage).';
          elements.createError.style.display = 'block';
          elements.createError.focus();
        } finally {
          elements.generateLinkBtn.disabled = false;
          elements.createLoading.style.display = 'none';
        }
      });
    }
  }

  if (elements.joinRoomScreen) {
    const hash = window.location.hash.slice(1);
    if (hash) {
      try {
        const [id, name] = atob(decodeURIComponent(hash)).split(':');
        state.currentRoom = { id, name };
        elements.joinRoomTitle.textContent = name || 'Unnamed';
        elements.joinNicknameInput.focus();
      } catch (e) {
        console.error('Invalid hash:', e);
        elements.joinError.textContent = 'Invalid room link.';
        elements.joinError.style.display = 'block';
        elements.joinError.focus();
      }
    } else {
      window.location.href = 'index.html';
    }
    if (elements.joinRoomForm) {
      elements.joinRoomForm.addEventListener('submit', async e => {
        e.preventDefault();
        const password = elements.joinPasswordInput.value.trim();
        const nickname = elements.joinNicknameInput.value.trim() || 'Anonymous';
        if (!password) {
          elements.joinError.textContent = 'Password required.';
          elements.joinError.style.display = 'block';
          elements.joinError.focus();
          return;
        }
        elements.joinRoomSubmitBtn.disabled = true;
        elements.joinLoading.style.display = 'block';
        try {
          if (await joinRoom(nickname, password)) {
            elements.joinPasswordInput.value = '';
            elements.joinNicknameInput.value = '';
          }
        } finally {
          elements.joinRoomSubmitBtn.disabled = false;
          elements.joinLoading.style.display = 'none';
        }
      });
    }
  }

  if (elements.chatRoom) {
    const hash = window.location.hash.slice(1);
    if (!hash) {
      window.location.href = 'index.html';
      return;
    }
    try {
      const [id, name] = atob(decodeURIComponent(hash)).split(':');
      state.currentRoom = { id, name };
      const storedNickname = localStorage.getItem(`nickname-${id}`);
      const storedPassword = localStorage.getItem(`password-${id}`);
      if (storedNickname && storedPassword) {
        state.nickname = storedNickname;
        const success = await joinRoom(storedNickname, storedPassword);
        if (success) {
          elements.roomTitle.textContent = `Room: ${name}`;
          elements.nicknameDisplay.textContent = `You are chatting as: ${storedNickname}`;
          connectWebSocket(id, elements);
        } else {
          window.location.href = `join.html#${encodeURIComponent(btoa(`${id}:${name}`))}`;
        }
      } else {
        window.location.href = `join.html#${encodeURIComponent(btoa(`${id}:${name}`))}`;
      }
    } catch (e) {
      console.error('Invalid hash:', e);
      elements.chatError.textContent = 'Invalid room link.';
      elements.chatError.style.display = 'block';
      elements.chatError.focus();
      window.location.assign('index.html');
    }
    if (elements.messageForm) {
      elements.messageForm.addEventListener('submit', async e => {
        e.preventDefault();
        const message = elements.inputMessage.value.trim();
        if (!message || !state.currentRoom || !state.key || !state.ws) {
          elements.chatError.textContent = 'Cannot send message. Please rejoin or check connection.';
          elements.chatError.style.display = 'block';
          elements.chatError.focus();
          return;
        }
        elements.sendBtn.disabled = true;
        try {
          const encrypted = await encryptMessage(message, state.key);
          state.ws.send(JSON.stringify({
            type: 'message',
            roomId: state.currentRoom.id,
            nickname: state.nickname,
            iv: encrypted.iv,
            data: encrypted.data,
            time: Date.now(),
          }));
          elements.inputMessage.value = '';
          elements.chatSuccess.textContent = 'Message sent!';
          elements.chatSuccess.style.display = 'block';
          setTimeout(() => elements.chatSuccess.style.display = 'none', 2000);
        } catch (e) {
          console.error('Send message error:', e);
          elements.chatError.textContent = 'Failed to send message. Try again.';
          elements.chatError.style.display = 'block';
          elements.chatError.focus();
        } finally {
          elements.sendBtn.disabled = false;
        }
      });
    }
    if (elements.copyLinkBtn) {
      elements.copyLinkBtn.addEventListener('click', () => {
        if (!state.currentRoom) return;
        const link = `${window.location.origin}/join.html#${encodeURIComponent(btoa(`${state.currentRoom.id}:${state.currentRoom.name}`))}`;
        navigator.clipboard.writeText(link).then(() => {
          elements.chatSuccess.textContent = 'Link copied!';
          elements.chatSuccess.style.display = 'block';
          setTimeout(() => elements.chatSuccess.style.display = 'none', 2000);
        }).catch(() => {
          elements.chatError.textContent = 'Failed to copy link.';
          elements.chatError.style.display = 'block';
        });
      });
    }
    if (elements.leaveRoomBtn) {
      elements.leaveRoomBtn.addEventListener('click', leaveRoom);
    }
    if (elements.loadMoreBtn) {
      elements.loadMoreBtn.addEventListener('click', () => {
        state.messageLimit += 50;
        if (state.ws) {
          state.ws.send(JSON.stringify({ type: 'load_more', roomId: state.currentRoom.id, limit: state.messageLimit }));
        }
      });
    }
  }

  loadRooms();
});
