// profile-pictures.js
import { postForm } from './api.js';
import { loadAuth } from './auth.js';

const PROFILE_PICTURE_COUNT = 102;
const PROFILE_PICTURES_PATH = '../profiles/';

let profilePictureModal = null;
let profilePictureGrid = null;

// Function to load a user's profile picture
export async function loadUserProfilePicture(username, imgElement) {
  try {
    const response = await postForm({
      mode: 'getProfilePicture',
      username: username
    });
    
    if (response.status === 'ok') {
      const pictureName = response.profile_picture || '001.png';
      const pictureUrl = `${PROFILE_PICTURES_PATH}${pictureName}`;
      imgElement.src = pictureUrl;
      imgElement.alt = `${username}'s profile picture`;
    }
  } catch (error) {
    console.error('Failed to load profile picture:', error);
    imgElement.src = `${PROFILE_PICTURES_PATH}001.png`; // Default picture
  }
}

export async function initProfilePictures() {
  createProfilePictureUI();
}

function createProfilePictureUI() {
  if (document.getElementById('profilePictureModal')) {
    profilePictureModal = document.getElementById('profilePictureModal');
    profilePictureGrid = profilePictureModal.querySelector('.profile-pictures-grid');
    renderProfilePictures();
    return;
  }
  
  profilePictureModal = document.createElement('div');
  profilePictureModal.id = 'profilePictureModal';
  profilePictureModal.className = 'profile-picture-modal';
  profilePictureModal.hidden = true;
  
  profilePictureModal.innerHTML = `
    <div class="profile-picture-modal-content">
      <div class="profile-picture-modal-header">
        <h3>Select Profile Picture</h3>
        <button class="close-profile-picture-modal">✕</button>
      </div>
      
      <div class="profile-pictures-grid"></div>
    </div>
  `;
  
  document.body.appendChild(profilePictureModal);
  
  profilePictureGrid = profilePictureModal.querySelector('.profile-pictures-grid');
  
  // Event listeners
  profilePictureModal.querySelector('.close-profile-picture-modal').addEventListener('click', closeProfilePictureModal);
  
  profilePictureModal.addEventListener('click', (e) => {
    if (e.target === profilePictureModal) {
      closeProfilePictureModal();
    }
  });
  
  renderProfilePictures();
}

function renderProfilePictures() {
  if (!profilePictureGrid) return;
  
  profilePictureGrid.innerHTML = '';
  
  for (let i = 1; i <= PROFILE_PICTURE_COUNT; i++) {
    const padded = String(i).padStart(3, '0');
    const pictureName = `${padded}.png`;
    const pictureUrl = `${PROFILE_PICTURES_PATH}${padded}.png`;
    
    const pictureElement = document.createElement('div');
    pictureElement.className = 'profile-picture-item';
    pictureElement.innerHTML = `
      <img src="${pictureUrl}" alt="Profile ${padded}" class="profile-picture-img">
      <div class="profile-picture-overlay">
        <button class="select-profile-picture" data-picture-name="${pictureName}">
          Select
        </button>
      </div>
    `;
    
    pictureElement.querySelector('.select-profile-picture').addEventListener('click', () => {
      selectProfilePicture(pictureName);
    });
    
    profilePictureGrid.appendChild(pictureElement);
  }
}

async function selectProfilePicture(pictureName) {
  const auth = loadAuth();
  if (!auth) {
    alert('Please login to change profile picture');
    return;
  }

  try {
    const response = await postForm({
      mode: 'setProfilePicture',
      username: auth.u,
      password: auth.p,
      picture_name: pictureName
    });

    if (response.status === 'ok') {
      alert('Profile picture updated successfully!');
      closeProfilePictureModal();

      // Update only the logged-in user’s images
      updateProfilePictureInUI(auth.u, pictureName);
    } else {
      alert(response.message || 'Failed to update profile picture');
    }
  } catch (error) {
    console.error('Profile picture update error:', error);
    alert('Failed to update profile picture: ' + error.message);
  }
}

function updateProfilePictureInUI(username, pictureName) {
  const pictureUrl = `${PROFILE_PICTURES_PATH}${pictureName}`;

  // Update only images belonging to this username
  const userImgs = document.querySelectorAll(
    `.user-profile-picture[data-username="${username}"]`
  );

  userImgs.forEach(img => {
    img.src = pictureUrl;
  });
}

export async function openProfilePictureSelector() {
  try {
    if (!profilePictureModal) {
      createProfilePictureUI();
    }
    
    profilePictureModal.hidden = false;
    document.body.style.overflow = 'hidden';
    
  } catch (error) {
    console.error('Failed to open profile picture selector:', error);
    alert('Failed to load profile pictures. Please try again.');
  }
}

function closeProfilePictureModal() {
  if (!profilePictureModal) return;
  profilePictureModal.hidden = true;
  document.body.style.overflow = '';
}

// Function to get user's profile picture name
export async function getUserProfilePicture(username) {
  try {
    const response = await postForm({
      mode: 'getProfilePicture',
      username: username
    });
    
    if (response.status === 'ok') {
      return response.profile_picture;
    }
  } catch (error) {
    console.error('Failed to get profile picture:', error);
  }
  return '001.png'; // Default picture
}