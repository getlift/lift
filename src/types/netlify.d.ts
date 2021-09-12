/* eslint-disable camelcase */
declare module "netlify" {
    export interface NetlifyApiOptions {
        userAgent?: string;
        scheme?: string;
        host?: string;
        pathPrefix?: string;
        globalParams?: {};
    }

    export interface NetlifyException {
        code: string;
        message: string;
    }

    export interface NetlifySite {
        id: string;
        state: string;
        plan: string;
        name: string;
        custom_domain: string;
        domain_aliases: string[];
        password: string;
        notification_email: string;
        url: string;
        ssl_url: string;
        admin_url: string;
        screenshot_url: string;
        created_at: string;
        updated_at: string;
        user_id: string;
        session_id: string;
        ssl: boolean;
        force_ssl: boolean;
        managed_dns: boolean;
        deploy_url: string;
        published_deploy: PublishedDeploy;
        account_name: string;
        account_slug: string;
        git_provider: string;
        deploy_hook: string;
        capabilities: Capabilities;
        processing_settings: ProcessingSettings;
        build_settings: BuildSettings;
        id_domain: string;
        default_hooks_data: DefaultHooksData;
        build_image: string;
    }

    export interface ListSites {
        name?: string;
        filter?: "all" | "owner" | "guest";
    }

    export interface DeleteSite {
        site_id: string;
    }

    export interface BuildSettings {
        id: number;
        provider: string;
        deploy_key_id: string;
        repo_path: string;
        repo_branch: string;
        dir: string;
        cmd: string;
        allowed_branches: string[];
        public_repo: boolean;
        private_logs: boolean;
        repo_url: string;
        env: Env;
        installation_id: number;
    }

    export interface Env {
        property1: string;
        property2: string;
    }

    export interface Capabilities {
        property1: Property;
        property2: Property;
    }

    export interface Property {}

    export interface DefaultHooksData {
        access_token: string;
    }

    export interface ProcessingSettings {
        skip: boolean;
        css: CSS;
        js: JS;
        images: Images;
        html: HTML;
    }

    export interface CSS {
        bundle: boolean;
        minify: boolean;
    }

    export interface JS {
        bundle: boolean;
        minify: boolean;
    }

    export interface HTML {
        pretty_urls: boolean;
    }

    export interface Images {
        optimize: boolean;
    }

    export interface PublishedDeploy {
        id: string;
        site_id: string;
        user_id: string;
        build_id: string;
        state: string;
        name: string;
        url: string;
        ssl_url: string;
        admin_url: string;
        deploy_url: string;
        deploy_ssl_url: string;
        screenshot_url: string;
        review_id: number;
        draft: boolean;
        required: string[];
        required_functions: string[];
        error_message: string;
        branch: string;
        commit_ref: string;
        commit_url: string;
        skipped: boolean;
        created_at: string;
        updated_at: string;
        published_at: string;
        title: string;
        context: string;
        locked: boolean;
        review_url: string;
        site_capabilities: SiteCapabilities;
    }

    export interface SiteCapabilities {
        large_media_enabled: boolean;
    }

    export interface CreateSiteRequest extends Partial<NetlifySite> {
        repo?: BuildSettings;
    }

    export interface CreateSiteResponse extends NetlifySite {
        repo: BuildSettings;
    }

    export default class NetlifyAPI {
        constructor(netlifyToken: string, ops?: NetlifyApiOptions);
        createSite: (site: { body: CreateSiteRequest }) => Promise<CreateSiteResponse>;
        deleteSite: (site: DeleteSite) => Promise<void>;
        getSite: (site: { id: string }) => Promise<NetlifySite>;
        listSites: () => Promise<NetlifySite[]>;
        deploy: (siteId: string, buildDir: string) => Promise<NetlifySite>;
    }
}
