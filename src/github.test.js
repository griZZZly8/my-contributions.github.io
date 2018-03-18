import 'whatwg-fetch';
import {aggregatePullRequests, AuthorizationError, getAccessToken} from './github';

beforeAll(() => {
    window.fetch = jest.fn();
});

beforeEach(() => {
    window.fetch.mockReset();
});

function mockResponse(body, headers = {}) {
    return new window.Response(
        JSON.stringify(body),
        {
            status: 200,
            headers: headers,
        },
    );
}

describe('getAccessToken', () => {
    const apiUrl = `${OAUTH_GATEWAY_URL}?client_id=${OAUTH_CLIENT_ID}`;

    it('handles HTTP errors', async () => {
        window.fetch.mockReturnValueOnce({ ok: false });

        const error = new Error(
            'Could not fetch ' +  apiUrl + '&code=code',
        );
        await expect(getAccessToken('code')).rejects.toEqual(error);
    });

    it('handles error in response', async () => {
        window.fetch.mockImplementation((url) => {
            switch (url) {
            case apiUrl + '&code=code':
                return mockResponse({error: 'test'});
            }
        });

        const error = new Error('Unable to get access token');
        await expect(getAccessToken('code')).rejects.toEqual(error);
    });

    it('handles empty token', async () => {
        window.fetch.mockImplementation((url) => {
            switch (url) {
            case apiUrl + '&code=code':
                return mockResponse({});
            }
        });

        const error = new Error('Unable to get access token');
        await expect(getAccessToken('code')).rejects.toEqual(error);
    });

    it('returns token', async () => {
        const token = 'token';

        window.fetch.mockImplementation((url) => {
            switch (url) {
            case apiUrl + '&code=code':
                return mockResponse({access_token: token});
            }
        });

        await expect(getAccessToken('code')).resolves.toEqual(token);
    });
});

describe('aggregatePullRequests', () => {
    it('handles HTTP errors', async () => {
        window.fetch.mockReturnValueOnce({ ok: false });

        const error = new Error('Could not fetch https://api.github.com/search/issues?per_page=100&q=type%3Apr%20author%3Atest');
        await expect(aggregatePullRequests('test', 'token')).rejects.toEqual(error);
    });

    it('handles authorization error', async () => {
        window.fetch.mockReturnValueOnce({ status: 401 });

        const error = new AuthorizationError();
        await expect(aggregatePullRequests('test', 'token')).rejects.toEqual(error);
    });

    it('tests author', async () => {
        const error = new Error('Invalid author');
        await expect(aggregatePullRequests('test:', 'token')).rejects.toEqual(error);
        await expect(aggregatePullRequests(' test', 'token')).rejects.toEqual(error);
    });

    it('handles pagination errors', async () => {
        window.fetch.mockReturnValueOnce(mockResponse({}, {'Link': 'error'}));

        const error = new Error('Pagination error');
        await expect(aggregatePullRequests('test', 'token')).rejects.toEqual(error);
    });

    it('fetches pages', async () => {
        window.fetch.mockImplementation((url) => {
            switch (url) {
            case 'https://api.github.com/search/issues?per_page=100&q=type%3Apr%20author%3Atest':
                return mockResponse({items: [
                    {
                        repository_url: 'https://api.github.com/repos/user/repo1',
                        pull_request: {url: 'https://api.github.com/repos/user/repo1/pulls/1'},
                        state: 'open',
                    },
                ]}, {
                    'Link':
                        '<https://api.github.com/search/issues?per_page=100&q=type%3Apr%20author%3Atest&page=2>;' +
                        ' rel="next", ' +
                        '<https://api.github.com/search/issues?per_page=100&q=type%3Apr%20author%3Atest&page=2>;' +
                        ' rel="last',
                });
            case 'https://api.github.com/search/issues?per_page=100&q=type%3Apr%20author%3Atest&page=2':
                return mockResponse({items: [
                    {
                        repository_url: 'https://api.github.com/repos/user/repo1',
                        pull_request: {url: 'https://api.github.com/repos/user/repo1/pulls/2'},
                        state: 'closed',
                    },
                ]}, {
                    'Link':
                        '<https://api.github.com/search/issues?per_page=100&q=type%3Apr%20author%3Atest&page=1>;' +
                        ' rel="prev", ' +
                        '<https://api.github.com/search/issues?per_page=100&q=type%3Apr%20author%3Atest&page=1>;' +
                        ' rel="first"',
                });
            case 'https://api.github.com/repos/user/repo1':
                return mockResponse({
                    html_url: 'https://github.com/user/repo1',
                    full_name: 'Repo 1',
                    stargazers_count: 1,
                    language: 'JavaScript',
                });
            case 'https://api.github.com/repos/user/repo1/pulls/2':
                return mockResponse({
                    'merged': false,
                });
            default:
                return { ok: false };
            }
        });

        const result = [
            {
                repository: {
                    html_url: 'https://github.com/user/repo1',
                    full_name: 'Repo 1',
                    stargazers_count: 1,
                    language: 'JavaScript',
                },
                open: 1,
                closed: 1,
                merged: 0,
                html_url: 'https://github.com/search?utf8=✓&q=type%3Apr%20author%3Atest%20repo%3ARepo%201',
            },
        ];

        await expect(aggregatePullRequests('test', 'token')).resolves.toEqual(result);
    });

    it('aggregates', async () => {
        window.fetch.mockImplementation((url) => {
            switch (url) {
            case 'https://api.github.com/search/issues?per_page=100&q=type%3Apr%20author%3Atest':
                return mockResponse({items: [
                    {
                        repository_url: 'https://api.github.com/repos/user/repo1',
                        pull_request: {url: 'https://api.github.com/repos/user/repo1/pulls/1'},
                        state: 'open',
                    },
                    {
                        repository_url: 'https://api.github.com/repos/user/repo1',
                        pull_request: {url: 'https://api.github.com/repos/user/repo1/pulls/2'},
                        state: 'closed',
                    },
                    {
                        repository_url: 'https://api.github.com/repos/user/repo1',
                        pull_request: {url: 'https://api.github.com/repos/user/repo1/pulls/3'},
                        state: 'closed',
                    },
                    {
                        repository_url: 'https://api.github.com/repos/user/repo2',
                        pull_request: {url: 'https://api.github.com/repos/user/repo2/pulls/1'},
                        state: 'open',
                    },
                    {
                        repository_url: 'https://api.github.com/repos/user/repo2',
                        pull_request: {url: 'https://api.github.com/repos/user/repo2/pulls/2'},
                        state: 'open',
                    },
                    {
                        repository_url: 'https://api.github.com/repos/user/repo3',
                        pull_request: {url: 'https://api.github.com/repos/user/repo3/pulls/1'},
                        state: 'closed',
                    },
                    {
                        repository_url: 'https://api.github.com/repos/user/repo3',
                        pull_request: {url: 'https://api.github.com/repos/user/repo3/pulls/2'},
                        state: 'closed',
                    },
                ]});
            case 'https://api.github.com/repos/user/repo1/pulls/2':
                return mockResponse({
                    'merged': false,
                });
            case 'https://api.github.com/repos/user/repo1/pulls/3':
                return mockResponse({
                    'merged': false,
                });
            case 'https://api.github.com/repos/user/repo3/pulls/1':
                return mockResponse({
                    'merged': false,
                });
            case 'https://api.github.com/repos/user/repo3/pulls/2':
                return mockResponse({
                    'merged': true,
                });
            case 'https://api.github.com/repos/user/repo1':
                return mockResponse({
                    html_url: 'https://github.com/user/repo1',
                    full_name: 'Repo 1',
                    stargazers_count: 1,
                    language: 'JavaScript',
                });
            case 'https://api.github.com/repos/user/repo2':
                return mockResponse({
                    html_url: 'https://github.com/user/repo2',
                    full_name: 'Repo 2',
                    stargazers_count: 3,
                    language: 'Python',
                });
            case 'https://api.github.com/repos/user/repo3':
                return mockResponse({
                    html_url: 'https://github.com/user/repo3',
                    full_name: 'Repo 3',
                    stargazers_count: 2,
                    language: 'Go',
                });
            default:
                return { ok: false };
            }
        });

        const result = [
            {
                repository: {
                    html_url: 'https://github.com/user/repo1',
                    full_name: 'Repo 1',
                    stargazers_count: 1,
                    language: 'JavaScript',
                },
                open: 1,
                closed: 2,
                merged: 0,
                html_url: 'https://github.com/search?utf8=✓&q=type%3Apr%20author%3Atest%20repo%3ARepo%201',
            },
            {
                repository: {
                    html_url: 'https://github.com/user/repo2',
                    full_name: 'Repo 2',
                    stargazers_count: 3,
                    language: 'Python',
                },
                open: 2,
                closed: 0,
                merged: 0,
                html_url: 'https://github.com/search?utf8=✓&q=type%3Apr%20author%3Atest%20repo%3ARepo%202',
            },
            {
                repository: {
                    html_url: 'https://github.com/user/repo3',
                    full_name: 'Repo 3',
                    stargazers_count: 2,
                    language: 'Go',
                },
                open: 0,
                closed: 1,
                merged: 1,
                html_url: 'https://github.com/search?utf8=✓&q=type%3Apr%20author%3Atest%20repo%3ARepo%203',
            },
        ];

        await expect(aggregatePullRequests('test', 'token')).resolves.toEqual(result);
    });
});