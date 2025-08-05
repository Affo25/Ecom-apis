// Static Theme2 Configuration (Waggy Theme)
// This file contains the default CMS configuration for theme2 (Waggy Pet Store)

const theme2Config = {
  theme_name: 'theme2',
  
  // Banner Section
  banner: {
    images: [
      {
        id: '1',
        url: '/theme2/images/banner-img.png',
        alt: 'Happy Pets Collection',
        title: 'Premium Pet Products',
        order: 0
      },
      {
        id: '2',
        url: '/theme2/images/banner-img2.png',
        alt: 'Pet Care Essentials',
        title: 'Everything Your Pet Needs',
        order: 1
      },
      {
        id: '3',
        url: '/theme2/images/banner-img3.png',
        alt: 'Pet Toys & Accessories',
        title: 'Fun & Safe Pet Toys',
        order: 2
      },
      {
        id: '4',
        url: '/theme2/images/banner-img4.png',
        alt: 'Pet Health & Wellness',
        title: 'Healthy Pet Care',
        order: 3
      }
    ],
    headline: 'Your Pet\'s Happiness is Our Priority',
    subheadline: 'Discover premium pet products that keep your furry friends healthy, happy, and stylish',
    ctaText: 'Shop Pet Products',
    ctaLink: '/products'
  },

  // Logo and Branding Section
  logo: {
    logoUrl: '/theme2/images/logo.png',
    logoAlt: 'Waggy Store Logo',
    faviconUrl: '/theme2/images/logo.png',
    brandColors: {
      primary: '#8B5CF6',
      secondary: '#6366F1',
      accent: '#F59E0B'
    }
  },

  // Text Content Section
  textContent: {
    companyName: 'Waggy Store',
    tagline: 'Where Pets Come First',
    aboutUs: 'Waggy Store is your trusted destination for premium pet products. We understand that pets are family, and we\'re committed to providing the highest quality food, toys, accessories, and care products to keep your beloved companions healthy and happy.',
    mission: 'To enhance the lives of pets and their owners by offering carefully curated, high-quality products that promote health, happiness, and the special bond between pets and their families.',
    vision: 'To become the leading pet store that pet owners trust for all their pet care needs, known for quality, expertise, and exceptional customer service.',
    values: [
      {
        id: '1',
        title: 'Pet Safety First',
        description: 'All our products meet the highest safety standards to ensure your pet\'s well-being.'
      },
      {
        id: '2',
        title: 'Quality Assurance',
        description: 'We carefully select products from trusted brands and manufacturers.'
      },
      {
        id: '3',
        title: 'Expert Knowledge',
        description: 'Our team is trained to provide expert advice on pet care and product selection.'
      },
      {
        id: '4',
        title: 'Customer Satisfaction',
        description: 'Your satisfaction and your pet\'s happiness are our top priorities.'
      },
      {
        id: '5',
        title: 'Community Support',
        description: 'We actively support local pet shelters and animal welfare organizations.'
      },
      {
        id: '6',
        title: 'Sustainable Practices',
        description: 'We promote eco-friendly products and sustainable pet care practices.'
      }
    ]
  },

  // Navigation Menus Section
  menus: {
    headerMenu: [
      {
        id: '1',
        label: 'Home',
        url: '/',
        order: 0,
        isExternal: false,
        openInNewTab: false,
        children: []
      },
      {
        id: '2',
        label: 'Shop',
        url: '/products',
        order: 1,
        isExternal: false,
        openInNewTab: false,
        children: [
          {
            id: '2-1',
            label: 'Dog Products',
            url: '/products?category=dogs',
            order: 0
          },
          {
            id: '2-2',
            label: 'Cat Products',
            url: '/products?category=cats',
            order: 1
          },
          {
            id: '2-3',
            label: 'Bird Products',
            url: '/products?category=birds',
            order: 2
          },
          {
            id: '2-4',
            label: 'Fish Products',
            url: '/products?category=fish',
            order: 3
          }
        ]
      },
      {
        id: '3',
        label: 'Pet Care',
        url: '/pet-care',
        order: 2,
        isExternal: false,
        openInNewTab: false,
        children: [
          {
            id: '3-1',
            label: 'Health & Wellness',
            url: '/pet-care/health',
            order: 0
          },
          {
            id: '3-2',
            label: 'Grooming',
            url: '/pet-care/grooming',
            order: 1
          },
          {
            id: '3-3',
            label: 'Training',
            url: '/pet-care/training',
            order: 2
          }
        ]
      },
      {
        id: '4',
        label: 'About Us',
        url: '/about',
        order: 3,
        isExternal: false,
        openInNewTab: false,
        children: []
      },
      {
        id: '5',
        label: 'Contact',
        url: '/contact',
        order: 4,
        isExternal: false,
        openInNewTab: false,
        children: []
      }
    ],
    footerMenu: [
      {
        id: '1',
        label: 'About Us',
        url: '/about',
        order: 0,
        isExternal: false
      },
      {
        id: '2',
        label: 'Our Products',
        url: '/products',
        order: 1,
        isExternal: false
      },
      {
        id: '3',
        label: 'Pet Care Guide',
        url: '/pet-care',
        order: 2,
        isExternal: false
      },
      {
        id: '4',
        label: 'Contact Us',
        url: '/contact',
        order: 3,
        isExternal: false
      },
      {
        id: '5',
        label: 'Shipping Info',
        url: '/shipping',
        order: 4,
        isExternal: false
      },
      {
        id: '6',
        label: 'Returns',
        url: '/returns',
        order: 5,
        isExternal: false
      },
      {
        id: '7',
        label: 'Privacy Policy',
        url: '/privacy',
        order: 6,
        isExternal: false
      },
      {
        id: '8',
        label: 'Terms of Service',
        url: '/terms',
        order: 7,
        isExternal: false
      },
      {
        id: '9',
        label: 'Pet Adoption',
        url: '/adoption',
        order: 8,
        isExternal: false
      },
      {
        id: '10',
        label: 'Pet Events',
        url: '/events',
        order: 9,
        isExternal: false
      }
    ]
  },

  // Footer Section
  footer: {
    copyright: '© 2024 Waggy Store. All rights reserved. Your trusted pet store for quality products and expert care.',
    contactInfo: {
      address: '123 Pet Street, Animal City, AC 12345',
      phone: '+1 (555) 123-4567',
      email: 'info@waggystore.com',
      workingHours: 'Mon-Sat: 9AM-8PM, Sun: 10AM-6PM'
    },
    socialLinks: {
      facebook: 'https://facebook.com/waggystore',
      twitter: 'https://twitter.com/waggystore',
      instagram: 'https://instagram.com/waggystore',
      linkedin: 'https://linkedin.com/company/waggystore',
      youtube: 'https://youtube.com/waggystore',
      tiktok: 'https://tiktok.com/@waggystore'
    },
    newsletter: {
      enabled: true,
      title: 'Stay Updated with Waggy Store',
      description: 'Get the latest pet care tips, product updates, and exclusive offers delivered to your inbox.'
    }
  },

  // Metadata
  isActive: true,
  created_at: new Date(),
  updated_at: new Date()
};

const getTheme2Config = (baseUrl = 'http://localhost:5009') => {
  // Return the config as is since we're using relative paths for theme2 assets
  return JSON.parse(JSON.stringify(theme2Config));
};

module.exports = {
  theme2Config,
  getTheme2Config
}; 