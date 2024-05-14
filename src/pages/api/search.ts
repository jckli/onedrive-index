import axios from 'axios'
import type { NextApiRequest, NextApiResponse } from 'next'

import { encodePath, getAccessToken } from '.'
import apiConfig from '../../../config/api.config'
import siteConfig from '../../../config/site.config'
import { OdSearchResult } from '../../types/index'
import { convertOnelinerToArray, matchProtectedRoute } from '../../utils/protectedRouteHandler'
import { checkAuthRoute } from '.'

export const config = {
	maxDuration: 60,
}

/**
 * Extract the searched item's path in field 'parentReference' and convert it to the
 * absolute path represented in onedrive-index
 *
 * @param path Path returned from the parentReference field of the driveItem
 * @returns The absolute path of the driveItem in the search result
 */
function mapAbsolutePath(path: string): string {
	// path is in the format of '/drive/root:/path/to/file', if baseDirectory is '/' then we split on 'root:',
	// otherwise we split on the user defined 'baseDirectory'
	const absolutePath = path.split(`_moe/Documents`)

	// path returned by the API may contain #, by doing a decodeURIComponent and then encodeURIComponent we can
	// replace URL sensitive characters such as the # with %23
	const newPath =
		absolutePath.length > 1 // solve https://github.com/spencerwooo/onedrive-vercel-index/issues/539
			? absolutePath[1]
				.split('/')
				.map(p => encodeURIComponent(decodeURIComponent(p)))
				.join('/')
			: ''

	return newPath
}

/**
 * Sanitize the search query
 *
 * @param query User search query, which may contain special characters
 * @returns Sanitised query string, which:
 * - encodes the '<' and '>' characters,
 * - replaces '?' and '/' characters with ' ',
 * - replaces ''' with ''''
 * Reference: https://stackoverflow.com/questions/41491222/single-quote-escaping-in-microsoft-graph.
 */
function sanitiseQuery(query: string): string {
	const sanitisedQuery = query
		.replace(/'/g, "''")
		.replace('<', ' &lt; ')
		.replace('>', ' &gt; ')
		.replace('?', ' ')
		.replace('/', ' ')
	return encodeURIComponent(sanitisedQuery)
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
	// Get access token from storage
	const accessToken = await getAccessToken()

	// Query parameter from request
	const { q: searchQuery = '' } = req.query

	// Set edge function caching for faster load times, check docs:
	// https://vercel.com/docs/concepts/functions/edge-caching
	res.setHeader('Cache-Control', apiConfig.cacheControlHeader)

	if (typeof searchQuery === 'string') {
		// Construct Microsoft Graph Search API URL, and perform search only under the base directory
		const searchRootPath = encodePath('/')
		const encodedPath = searchRootPath === '' ? searchRootPath : searchRootPath + ':'

		const searchApi = `${apiConfig.driveApi}/root${encodedPath}/search(q='${sanitiseQuery(searchQuery)}')`

		try {
			const { data } = await axios.get(searchApi, {
				headers: { Authorization: `Bearer ${accessToken}` },
				params: {
					select: 'id,name,file,folder,parentReference,webUrl',
					top: siteConfig.maxItems,
				},
			})
			const arr: OdSearchResult = data.value
			const tokens: { path: string; token: string }[] = convertOnelinerToArray(
				req.headers['od-protected-tokens'] as string
			)
			arr.map(item => {
				const path = mapAbsolutePath(item.webUrl)
				item.path = path
			})
			// check if the path is protected, if so check the token to the checkAuthRoute
			var filteredArr: OdSearchResult = []
			for (const item of arr) {
				if (item.path.length > 0 && !item.path.startsWith('/Forms')) {
					const p = matchProtectedRoute(item.path)
					const token = tokens.find(t => t.path === p)

					if (p.length > 0) {
						if (token) {
							const { code } = await checkAuthRoute(item.path, accessToken, token.token)
							if (code === 200) {
								filteredArr.push(item)
							}
						}
					} else {
						filteredArr.push(item)
					}
				}
			}

			res.status(200).json(filteredArr)
		} catch (error: any) {
			res.status(error?.response?.status ?? 500).json({ error: error?.response?.data ?? 'Internal server error.' })
		}
	} else {
		res.status(200).json([])
	}
	return
}
