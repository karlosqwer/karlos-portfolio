const iconeMenu = document.querySelector('#icone-menu');
const navLinks = document.querySelector('.nav-links');

iconeMenu.onclick = () => {
    navLinks.classList.toggle('active');
};
