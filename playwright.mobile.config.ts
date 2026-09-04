import base from './playwright.config';
import { devices } from '@playwright/test';

const mobileConfig = { ...base, projects: [{ name: 'mobile-chromium', use: { ...devices['Pixel 5'] } }] };
export default mobileConfig;
