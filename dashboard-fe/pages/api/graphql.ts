import { ApolloServer, gql } from "apollo-server-micro";

import { versionManagementEnabled } from "./db";

import dbDriver from "../../src/database/drivers";
import ModuleManager from "../../src/managers/Module";
import VersionManager from "../../src/managers/Version";
import { privateConfig } from "../../src/config";
import auth0 from "../../src/auth0";
import "../../src/webhooks";
import url from "native-url";

const typeDefs = gql`
  scalar Date

  type Query {
    dashboard: DashboardInfo!
    userByEmail(email: String): User
    groups(name: String): [Group!]!
    siteSettings: SiteSettings!
  }

  type Mutation {
    updateApplicationSettings(
      group: String!
      application: String!
      settings: ApplicationSettingsInput!
    ): ApplicationSettings
    updateGroupSettings(
      group: String!
      settings: GroupSettingsInput!
    ): GroupSettings
    publishVersion(
      group: String!
      application: String!
      version: String!
    ): ApplicationVersion!
    setRemoteVersion(
      group: String!
      application: String!
      remote: String!
      version: String
    ): Application!
    updateUser(user: UserInput!): User!
    updateSiteSettings(settings: SiteSettingsInput): SiteSettings!
    addMetric(
      group: String!
      application: String
      name: String!
      date: String!
      value: Float!
      url: String
      q1: Float
      q2: Float
      q3: Float
      max: Float
      min: Float
    ): Boolean!
    updateMetric(
      group: String!
      application: String
      name: String!
      date: String!
      value: Float!
      url: String
      q1: Float
      q2: Float
      q3: Float
      max: Float
      min: Float
    ): Boolean!
  }

  enum WebhookEventType {
    updateApplication
    deleteApplication
    updateApplicationVersion
    deleteApplicationVersion
  }

  type Webhook {
    event: WebhookEventType!
    url: String!
  }

  type Token {
    key: String!
    value: String!
  }

  type SiteSettings {
    webhooks: [Webhook]
    tokens: [Token]
  }

  input WebhookInput {
    event: WebhookEventType!
    url: String!
  }

  input TokenInput {
    key: String!
    value: String!
  }

  input SiteSettingsInput {
    webhooks: [WebhookInput]
    tokens: [TokenInput]
  }

  input MetadataInput {
    name: String!
    value: String!
  }

  input TrackedURLVariantInput {
    name: String!
    search: String
    new: Boolean
  }

  input TrackedURLInput {
    url: String!
    metadata: [MetadataInput]
    variants: [TrackedURLVariantInput!]!
  }

  input GroupSettingsInput {
    trackedURLs: [TrackedURLInput]
  }
  input ApplicationSettingsInput {
    trackedURLs: [TrackedURLInput]
  }

  type DashboardInfo {
    versionManagementEnabled: Boolean!
  }

  type Dependency {
    name: String!
    type: String!
    version: String!
  }

  type Remote {
    internalName: String!
    name: String!
  }

  type ApplicationVersion {
    environment: String!
    version: String!
    latest: Boolean!
    posted: String!
    remote: String!
    remotes: [Remote!]!
    dependencies: [Dependency]!
    overrides: [Override!]!
    modules(name: String): [Module!]!
    consumes: [Consume!]!
  }

  type ApplicationOverride {
    version: String!
    application: Application!
    name: String!
  }

  type Override {
    id: ID!
    application: Application!
    version: String
    name: String!
  }

  type Consume {
    consumingApplication: Application!
    application: Application
    name: String!
    usedIn: [FileLocation!]!
  }

  type FileLocation {
    file: String!
    url: String
  }

  type MetricValue {
    url: String
    name: String!
    date: Date!
    value: Float!
  }

  type Module {
    id: ID!
    application: Application!
    name: String!
    file: String
    requires: [String!]!
    consumedBy: [Consume]!
    metadata: [Metadata!]!
    tags: [String!]!
  }

  type TrackedURL {
    url: String!
    variants: [TrackedURLVariant!]!
    metadata: [Metadata!]!
  }

  type ApplicationSettings {
    trackedURLs: [TrackedURL]
  }

  type TrackedURLVariant {
    name: String!
    search: String!
    new: Boolean!
  }

  type Application {
    id: String!
    name: String!
    group: String!
    metadata: [Metadata!]!
    tags: [String!]!
    metrics(names: [String!]): [MetricValue!]!
    overrides: [ApplicationOverride!]!
    versions(environment: String, latest: Boolean): [ApplicationVersion!]!
    settings: ApplicationSettings
  }

  type GroupSettings {
    trackedURLs: [TrackedURL]
  }

  type Group {
    id: String!
    name: String!
    metadata: [Metadata!]!
    applications(id: String): [Application!]!
    metrics(names: [String!]): [MetricValue!]!
    settings: GroupSettings
  }

  type Metadata {
    name: String!
    value: String!
  }

  input UserInput {
    email: String!
    name: String!
    groups: [String!]
    defaultGroup: String!
  }

  type User {
    id: String!
    email: String!
    name: String!
    groups: [String!]
    defaultGroup: String!
  }

  type Versions {
    versions: [String!]!
    latest: String!
    override: [Dependency!]
  }
`;

const resolvers = {
  Query: {
    dashboard: () => {
      return {
        versionManagementEnabled: versionManagementEnabled(),
      };
    },
    userByEmail: async (_: any, { email }: any) => {
      await dbDriver.setup();
      return dbDriver.user_findByEmail(email);
    },
    groups: async (_: any, { name }: any, ctx: any) => {
      await dbDriver.setup();
      if (name) {
        const found = await dbDriver.group_findByName(name);
        return found ? [found] : [];
      } else {
        return dbDriver.group_findAll();
      }
    },
    siteSettings: () => {
      return dbDriver.siteSettings_get();
    },
  },
  Mutation: {
    updateApplicationSettings: async (
      _: any,
      { group, application, settings }: any
    ) => {
      await dbDriver.setup();
      const app = await dbDriver.application_find(application);
      app.settings = settings;
      await dbDriver.application_update(app);
      return settings;
    },
    updateGroupSettings: async (_: any, { group, settings }: any) => {
      await dbDriver.setup();
      const grp = await dbDriver.group_find(group);
      grp.settings = settings;
      await dbDriver.group_update(grp);
      return settings;
    },
    addMetric: async (
      _: any,
      { group, application, date, name, value, url }: any
    ) => {
      await dbDriver.setup();
      dbDriver.application_addMetrics(application, {
        date: new Date(Date.parse(date)),
        id: application ? application : group,
        type: application ? "application" : "group",
        name,
        value,
        url,
        //TODO add extra keys
      });
      return true;
    },

    updateMetric: async (
      _: any,
      { group, application, date, name, value, url }: any
    ) => {
      await dbDriver.setup();
      console.log("Mutation", group, value, name);
      dbDriver.group_updateMetric(application, {
        id: application ? application : group,
        type: application ? "application" : "group",
        name,
        value,
        url,
        //TODO add extra keys
      });
      return true;
    },
    publishVersion: async (_: any, { group, application, version }: any) => {
      const out = await VersionManager.publishVersion(
        group,
        application,
        version
      );
      return out;
    },
    setRemoteVersion: async (
      _: any,
      { group, application, remote, version }: any
    ) => {
      return VersionManager.setRemoteVersion(
        group,
        application,
        remote,
        version
      );
    },
    updateUser: async (_: any, { user }: any) => {
      await dbDriver.setup();
      await dbDriver.user_update({
        id: user.email,
        ...user,
      });
      return dbDriver.user_find(user.email);
    },
    updateSiteSettings: async (_: any, { settings }: any) => {
      await dbDriver.setup();
      await dbDriver.siteSettings_update(settings);
      return dbDriver.siteSettings_get();
    },
  },
  Application: {
    versions: async ({ id }: any, { environment, latest }: any, ctx: any) => {
      ctx.environment = environment;
      await dbDriver.setup();
      let found = await dbDriver.applicationVersion_findAll(id, environment);
      if (latest !== undefined) {
        found = found.filter(({ latest }: any) => latest);
      }
      return found;
    },
    metrics: async ({ id }: any, { names }: any, ctx: any) => {
      await dbDriver.setup();
      const metrics = await dbDriver.application_getMetrics(id);
      if (names) {
      } else {
      }
      return names
        ? metrics.filter(({ name }: any) => names.includes(name))
        : metrics;
    },
  },
  Consume: {
    consumingApplication: async (parent: any, args: any, ctx: any) => {
      await dbDriver.setup();
      return dbDriver.application_find(parent.consumingApplicationID);
    },
    application: async (parent: any, args: any, ctx: any) => {
      await dbDriver.setup();
      return dbDriver.application_find(parent.applicationID);
    },
  },
  Module: {
    consumedBy: async (parent: any, args: any, ctx: any) => {
      await dbDriver.setup();
      return ModuleManager.getConsumedBy(
        ctx.group,
        ctx.environment,
        parent.applicationID,
        parent.name
      );
    },
  },
  ApplicationVersion: {
    modules: async ({ modules }: any, { name }: any) => {
      return name
        ? modules.filter(({ name: moduleName }) => name === moduleName)
        : modules;
    },
  },
  ApplicationOverride: {
    application: async ({ name }: { name: string }) => {
      await dbDriver.setup();
      return dbDriver.application_find(name);
    },
  },
  Group: {
    metrics: async ({ id }: any, { names }: any, ctx: any) => {
      await dbDriver.setup();
      const metrics = await dbDriver.group_getMetrics(id);
      if (names) {
      } else {
      }
      return names
        ? metrics.filter(({ name }: any) => names.includes(name))
        : metrics;
    },
    applications: async ({ id }: any, { id: applicationId }, ctx: any) => {
      ctx.group = id;
      await dbDriver.setup();
      if (!applicationId) {
        return dbDriver.application_findInGroups([id]);
      } else {
        const found = await dbDriver.application_find(applicationId);
        return found ? [found] : [];
      }
    },
  },
};

const apolloServer = new ApolloServer({ typeDefs, resolvers });

const apolloHandler = apolloServer.createHandler({
  path: "/api/graphql",
});

function runMiddleware(req: any, res: any, fn: any) {
  return new Promise((resolve, reject) => {
    fn(req, res, (result: any) => {
      if (result instanceof Error) {
        return reject(result);
      }

      return resolve(result);
    });
  });
}

const allowCors = async (req: any, res: any, next: any) => {
  res.setHeader("Access-Control-Allow-Credentials", true);
  res.setHeader("Access-Control-Allow-Origin", "*");
  // another common pattern
  // res.setHeader('Access-Control-Allow-Origin', req.headers.origin);
  res.setHeader(
    "Access-Control-Allow-Methods",
    "GET,OPTIONS,PATCH,DELETE,POST,PUT"
  );
  res.setHeader(
    "Access-Control-Allow-Headers",
    "X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version"
  );

  if (req.method === "OPTIONS") {
    res.status(200).end();
    return;
  }
  return next(req, res);
};

const fetchToken = (headers) => {
  return fetch(url.resolve(privateConfig.EXTERNAL_URL, "api/graphql"), {
    method: "POST",
    headers: {
      ...headers,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      query: `query {
    {
      siteSettings {
        tokens {
          key
          value
        }
      }
    }
  }`,
    }),
  });
};

const checkForTokens = async () => {
  const { tokens } = await dbDriver.siteSettings_get();
  if (Array.isArray(tokens) && tokens.length === 0) {
    return false;
  } else {
    return tokens;
  }
};
async function handler(req: any, res: any) {
  await runMiddleware(req, res, allowCors);
  // @ts-expect-error ts-migrate(2554) FIXME: Expected 1 arguments, but got 0.
  let session: { noAuth: boolean; user: {} } = false;
  if (process.env.NODE_ENV === "production") {
    session = await auth0.getSession(req);
  }
  const tokens = await checkForTokens();

  if (
    !tokens ||
    req?.headers?.Authorization?.find((token) => tokens.includes(token))
  ) {
    session = {
      user: {},
      noAuth: false,
    };
  }
  const hasValidToken =
    tokens &&
    tokens.some((token) => {
      return req.query.token === token;
    });
  if (process.env.NODE_ENV === "production") {
    console.log("has valid token", hasValidToken);
  }
  // @ts-expect-error ts-migrate(2339) FIXME: Property 'INTERNAL_TOKEN' does not exist on type '... Remove this comment to see the full error message
  if (!hasValidToken) {
    //   // @ts-expect-error ts-migrate(2339) FIXME: Property 'user' does not exist on type '{ noAuth: ... Remove this comment to see the full error message
    //   if (!session || !session.user) {
    //     // @ts-expect-error ts-migrate(2339) FIXME: Property 'noAuth' does not exist on type '{ noAuth... Remove this comment to see the full error message
    //     if (!session.noAuth) {
    //       res.status(401).json({
    //         errors: [
    //           {
    //             message: "Unauthorized",
    //             extensions: { code: "UNAUTHENTICATED" },
    //           },
    //         ],
    //       });
    //     }
    //   }
  }

  console.log("runMiddleware");
  await runMiddleware(req, res, apolloHandler);
}

export const config = {
  api: {
    bodyParser: false,
  },
};

export default handler;
