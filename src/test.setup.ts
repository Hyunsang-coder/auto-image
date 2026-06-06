import { useI18nStore } from './i18n'

// Unit tests assert Korean source strings (warnings, defaults); jsdom's
// navigator.language is en-US, so pin the UI locale to the source language.
useI18nStore.setState({ locale: 'ko' })
