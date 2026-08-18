import { describe, expect, it } from 'bun:test'
import { isLocalHostname, normalizeHostname, parseSchoolDomains, resolveSchoolByHostname } from './school-host'

const SCHOOLS = [
  { code: 'SHB-001', domain: 'shb-001.app.test' },
  { code: 'SMPN-01', domain: 'smpn-01.app.test' },
  { code: 'SMA-INS', domain: null }, // no dedicated subdomain — path fallback only
]

describe('normalizeHostname', () => {
  it('lowercases, trims and strips a trailing dot', () => {
    expect(normalizeHostname('  ShB-001.App.TEST. ')).toBe('shb-001.app.test')
  })
})

describe('isLocalHostname', () => {
  it('treats loopback hosts as local (path fallback applies)', () => {
    expect(isLocalHostname('localhost')).toBe(true)
    expect(isLocalHostname('127.0.0.1')).toBe(true)
    expect(isLocalHostname('::1')).toBe(true)
    expect(isLocalHostname('shb-001.app.test')).toBe(false)
  })
})

describe('parseSchoolDomains (middleware SCHOOL_DOMAINS env)', () => {
  it('parses hostname=CODE pairs and normalizes them', () => {
    const map = parseSchoolDomains('shb-001.app.test=SHB-001, smpn-01.app.test=smpn-01')
    expect(map['shb-001.app.test']).toBe('SHB-001')
    expect(map['smpn-01.app.test']).toBe('SMPN-01')
  })

  it('skips malformed entries and empty input', () => {
    expect(parseSchoolDomains('')).toEqual({})
    expect(parseSchoolDomains('no-equals-sign,=CODE,host=')).toEqual({})
  })
})

describe('resolveSchoolByHostname (client, School.domain is source of truth)', () => {
  it('resolves a school by its exact domain', () => {
    expect(resolveSchoolByHostname('smpn-01.app.test', SCHOOLS)).toBe('SMPN-01')
  })

  it('accepts the www. prefix', () => {
    expect(resolveSchoolByHostname('www.shb-001.app.test', SCHOOLS)).toBe('SHB-001')
  })

  it('normalizes case before matching', () => {
    expect(resolveSchoolByHostname('SMPN-01.APP.TEST', SCHOOLS)).toBe('SMPN-01')
  })

  it('returns null for localhost (path fallback)', () => {
    expect(resolveSchoolByHostname('localhost', SCHOOLS)).toBeNull()
    expect(resolveSchoolByHostname('127.0.0.1', SCHOOLS)).toBeNull()
  })

  it('returns null for unknown hosts and schools without a domain', () => {
    expect(resolveSchoolByHostname('example.com', SCHOOLS)).toBeNull()
    expect(resolveSchoolByHostname('sma-ins.app.test', SCHOOLS)).toBeNull()
  })
})
