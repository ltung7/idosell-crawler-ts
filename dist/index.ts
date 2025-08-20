import axios, { AxiosInstance, AxiosRequestConfig } from 'axios'
import { wrapper } from "axios-cookiejar-support";
import { CookieJar } from "tough-cookie";
import queryString from "qs";
import FormData from 'form-data';
import { PATHS } from './paths';
import { IdosellPanelCredentials, UrlParams } from './types';

export default class IdosellCrawler {
    credentials: IdosellPanelCredentials;
    referer: string;
    jar: CookieJar;
    axios: AxiosInstance;
    logged: boolean;

    constructor(credentials: IdosellPanelCredentials) {
        this.credentials = credentials;
        this.referer = this.buildPath(PATHS.MAIN);
        this.jar = new CookieJar();
        this.axios = wrapper(axios.create({
            withCredentials: true,
            baseURL: this.credentials.url + '/panel/',
            timeout: 3600000,
            jar: this.jar,
            headers: {
                Referer: this.referer 
            }
        }))
        this.logged = false
    }

    buildPath(node: string, params: UrlParams = '') {
        const url = [
            this.credentials.url.replace(/\/$/g, ''),
            'panel',
            node
        ].join('/')
        if (typeof params === 'object') params = '?' + queryString.stringify(params);
        return url + params;
    }

    getKey() {
        return {
            panel_login: this.credentials.login,
            panel_password: this.credentials.password,
            domain: (new URL(this.credentials.url)).hostname,
            trigger: "Login",
        }
    }

    async login() {
        if (this.logged) return;
        const key = new URLSearchParams(this.getKey()).toString();
        const url = this.buildPath(PATHS.MAIN);
        
        await this.axios.get(url);
        const options: AxiosRequestConfig = {
            method: 'POST',
            headers: { 
                'content-type': 'application/x-www-form-urlencoded'
            }
        };
        let loginResponse = await this.axios.post(url, key, options).catch(err => {
            if (err.response.status >= 400) throw err;
            return err.response;
        });
        if (loginResponse.data.length > 10000 && loginResponse.data.includes('Błąd:')) {
            throw new Error('Invalid response - unable to login');
        }
        if (loginResponse.data.includes('Uwierzytelnianie dwuskładnikowe (2FA) nie jest włączone')) {
            await this.axios.post(url, 'clear=suggest', options);
        }
        this.logged = true;
    }

    async postPanel(url: string, data: any, config: AxiosRequestConfig = {}) {
        if (!this.logged) await this.login();
        if (!config.headers) config.headers = { Referer: url }
        else if (!config.headers.Referer) config.headers.Referer = url;
        const query = typeof data === 'string' ? data : queryString.stringify(data);
        return this.axios.post(url, query, config);
    }

    async postForm (url: string, data: any, config: AxiosRequestConfig = {}) {
        if (!this.logged) await this.login();
        if (!config.headers) config.headers = {}
        if (!config.headers.Referer) config.headers.Referer = this.buildPath(url);
        const formData = new FormData();
        for (const key in data) {
            if (Array.isArray(data[key])) {
                data[key].forEach(item => formData.append(key + '[]', item));
                continue;
            }
            formData.append(key, data[key]);
        }
        const headers = formData.getHeaders();
        Object.assign(config.headers, headers);
        return this.axios.post(url, formData, config).then(response => response.data);
    }

    stripHtmlTags (html: string) {
        html = html.replace(/<head[\s\S]*?<\/head>/gi, '');
        html = html.replace(/<script[\s\S]*?<\/script>/gi, '');
        return html;
    }

    getHtmlTable(html: string, tableIndex = 0) {
        if (tableIndex) {
            const match = html.match(/<table[\s\S]*?<\/table>/gi);
            return match ? match[tableIndex] : html;
        } else {
            const match = html.match(/<table[\s\S]*?<\/table>/i);
            return match ? match[0] : html;
        }
    }

    async getPage(url: string, data: any = null, config: AxiosRequestConfig = {}) {
        if (!this.logged) await this.login();
        if (!config.headers) config.headers = { Referer: url }
        else if (!config.headers.Referer) config.headers.Referer = url;
        if (data) {
            const query = queryString.stringify(data);
            if (url.indexOf('?') === -1) url += '?';
            url += query;
        }
        return this.axios.get(url, config).then(response => response.data);
    }

    async downloadTempFile (file: string, module = 'reports') {
        if (!this.logged) await this.login();
        const url = this.buildPath(`ajax/temporary-storage.php?action=getFile&module=${module}&file=${file}`);
        const response = await this.axios.get(url, { responseType: 'arraybuffer' })
        return response.data;
    }
}

export { PATHS }