import sha256 from 'crypto-js/sha256'
import siteConfig from '../../config/site.config'

// Hash password token with SHA256
function encryptToken(token: string): string {
	return sha256(token).toString()
}

// Fetch stored token from localStorage and encrypt with SHA256
export function getStoredToken(path: string): string | null {
	const storedToken =
		typeof window !== 'undefined' ? JSON.parse(localStorage.getItem(matchProtectedRoute(path)) as string) : ''
	return storedToken ? encryptToken(storedToken) : null
}

// fetch all stored tokens from localStorage
export function getAllStoredTokens(): { path: string; token: string }[] {
	const tokens: { path: string; token: string }[] = []
	if (typeof window === 'undefined') return tokens
	for (const r of siteConfig.protectedRoutes) {
		if (localStorage.hasOwnProperty(r)) {
			// write both the path and the token to the array
			const token = JSON.parse(localStorage.getItem(r) as string)

			tokens.push({ path: r, token: encryptToken(token) })
		}
	}
	return tokens
}

export function convertArrayToOneliner(arr: { path: string; token: string }[]): string {
	return arr.map(({ path, token }) => `(${path},${token}),`).join('')
}

export function convertOnelinerToArray(str: string): { path: string; token: string }[] {
	return str
		.split('),')
		.filter(Boolean)
		.map(s => {
			const [path, token] = s.replace('(', '').split(',')
			return { path, token }
		})
}

/**
 * Compares the hash of .password and od-protected-token header
 * @param odTokenHeader od-protected-token header (sha256 hashed token)
 * @param dotPassword non-hashed .password file
 * @returns whether the two hashes are the same
 */
export function compareHashedToken({
	odTokenHeader,
	dotPassword,
}: {
	odTokenHeader: string
	dotPassword: string
}): boolean {
	return encryptToken(dotPassword.trim()) === odTokenHeader
}
/**
 * Match the specified route against a list of predefined routes
 * @param route directory path
 * @returns whether the directory is protected
 */

export function matchProtectedRoute(route: string): string {
	const protectedRoutes: string[] = siteConfig.protectedRoutes
	let authTokenPath = ''

	for (const r of protectedRoutes) {
		// protected route array could be empty
		if (r) {
			if (
				route.startsWith(
					r
						.split('/')
						.map(p => encodeURIComponent(p))
						.join('/')
				)
			) {
				authTokenPath = r
				break
			}
		}
	}
	return authTokenPath
}
