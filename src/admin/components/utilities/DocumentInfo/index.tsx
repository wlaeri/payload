import React, {
  createContext, useCallback, useContext, useEffect, useState,
} from 'react';
import qs from 'qs';
import { useConfig } from '../Config';
import { PaginatedDocs } from '../../../../mongoose/types';
import { ContextType, Props, Version } from './types';
import { TypeWithID } from '../../../../globals/config/types';
import { TypeWithTimestamps } from '../../../../collections/config/types';
import { Where } from '../../../../types';
import { DocumentPreferences } from '../../../../preferences/types';
import { usePreferences } from '../Preferences';

const Context = createContext({} as ContextType);

export const DocumentInfoProvider: React.FC<Props> = ({
  children,
  global,
  collection,
  id,
}) => {
  const { serverURL, routes: { api } } = useConfig();
  const { getPreference } = usePreferences();
  const [publishedDoc, setPublishedDoc] = useState<TypeWithID & TypeWithTimestamps>(null);
  const [versions, setVersions] = useState<PaginatedDocs<Version>>(null);
  const [unpublishedVersions, setUnpublishedVersions] = useState<PaginatedDocs<Version>>(null);

  const baseURL = `${serverURL}${api}`;
  let slug;
  let type;
  let preferencesKey;

  if (global) {
    slug = global.slug;
    type = 'global';
    preferencesKey = `global-${slug}`;
  }

  if (collection) {
    slug = collection.slug;
    type = 'collection';

    if (id) {
      preferencesKey = `collection-${slug}-${id}`;
    }
  }

  const getVersions = useCallback(async () => {
    let versionFetchURL;
    let publishedFetchURL;
    let shouldFetchVersions = false;
    let unpublishedVersionJSON = null;
    let versionJSON = null;
    let shouldFetch = true;

    const versionParams = {
      where: {
        and: [],
      },
      depth: 0,
    };

    const publishedVersionParams: { where: Where, depth: number } = {
      where: {
        and: [
          {
            or: [
              {
                _status: {
                  equals: 'published',
                },
              },
              {
                _status: {
                  exists: false,
                },
              },
            ],
          },
        ],
      },
      depth: 0,
    };

    if (global) {
      shouldFetchVersions = Boolean(global?.versions);
      versionFetchURL = `${baseURL}/globals/${global.slug}/versions`;
      publishedFetchURL = `${baseURL}/globals/${global.slug}?${qs.stringify(publishedVersionParams)}`;
    }

    if (collection) {
      shouldFetchVersions = Boolean(collection?.versions);
      versionFetchURL = `${baseURL}/${collection.slug}/versions`;

      publishedVersionParams.where.and.push({
        id: {
          equals: id,
        },
      });

      publishedFetchURL = `${baseURL}/${collection.slug}?${qs.stringify(publishedVersionParams)}`;

      if (!id) {
        shouldFetch = false;
      }

      versionParams.where.and.push({
        parent: {
          equals: id,
        },
      });
    }

    if (shouldFetch) {
      let publishedJSON = await fetch(publishedFetchURL, { credentials: 'include' }).then((res) => res.json());

      if (collection) {
        publishedJSON = publishedJSON?.docs?.[0];
      }

      if (shouldFetchVersions) {
        versionJSON = await fetch(`${versionFetchURL}?${qs.stringify(versionParams)}`, { credentials: 'include' }).then((res) => res.json());

        if (publishedJSON?.updatedAt) {
          const newerVersionParams = {
            ...versionParams,
            where: {
              ...versionParams.where,
              and: [
                ...versionParams.where.and,
                {
                  updatedAt: {
                    greater_than: publishedJSON?.updatedAt,
                  },
                },
              ],
            },
          };

          // Get any newer versions available
          const newerVersionRes = await fetch(`${versionFetchURL}?${qs.stringify(newerVersionParams)}`, { credentials: 'include' });

          if (newerVersionRes.status === 200) {
            unpublishedVersionJSON = await newerVersionRes.json();
          }
        }
      }

      setPublishedDoc(publishedJSON);
      setVersions(versionJSON);
      setUnpublishedVersions(unpublishedVersionJSON);
    }
  }, [global, collection, id, baseURL]);

  useEffect(() => {
    getVersions();
  }, [getVersions]);

  useEffect(() => {
    const getDocPreferences = async () => {
      await getPreference<DocumentPreferences>(preferencesKey);
    };

    getDocPreferences();
  }, [getPreference, preferencesKey]);

  const value = {
    slug,
    type,
    preferencesKey,
    global,
    collection,
    versions,
    unpublishedVersions,
    getVersions,
    publishedDoc,
    id,
  };

  return (
    <Context.Provider value={value}>
      {children}
    </Context.Provider>
  );
};

export const useDocumentInfo = (): ContextType => useContext(Context);

export default Context;
